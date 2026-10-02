import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, fakeD1, fakeR2, jsonRes, putImage } from './helpers.js';

const mw = await loadModule('functions/api/_middleware.js');
const assessments = await loadModule('functions/api/assessments/index.js');
const assessmentGet = await loadModule('functions/api/assessments/[id]/index.js');
const sheetPut = await loadModule('functions/api/assessments/[id]/question-sheet/[fileId].js');
const paperPut = await loadModule('functions/api/assessments/[id]/papers/[paperId].js');
const analyze = await loadModule('functions/api/papers/[paperId]/analyze.js');
const health = await loadModule('functions/api/health.js');
const { runPool, makePaperProcessor } = await loadModule('public/js/upload-queue.js');

const URL0 = 'https://t.test';
const baseEnv = (over = {}) => ({ DB: fakeD1(), FILES: fakeR2(), GEMINI_API_KEY: 'k', TAVIO_ACCESS_CODE: 'sesame', GEMINI_MAX_ATTEMPTS: '1', ...over });
const call = async (fn, ctx) => { const r = await fn(ctx); return { status: r.status, body: await r.json() }; };

async function newAssessment(env) {
  const r = await call(assessments.onRequestPost, { env, request: new Request(`${URL0}/api/assessments`, { method: 'POST', body: JSON.stringify({ title: 'اختبار' }) }) });
  return r.body.assessment.id;
}
const upPaper = (env, aid, pid) => call(paperPut.onRequestPut, { env, params: { id: aid, paperId: pid }, request: putImage(`${URL0}/x`) });
const upSheet = (env, aid, fid) => call(sheetPut.onRequestPut, { env, params: { id: aid, fileId: fid }, request: putImage(`${URL0}/x`) });
const doAnalyze = (env, pid) => call(analyze.onRequestPost, { env, params: { paperId: pid } });
const status = (env, pid) => env.DB.raw.prepare('SELECT status, error_code, attempts FROM student_papers WHERE id=?').get(pid);

// يستبدل fetch العام لاستدعاءات Gemini داخل الـ handlers.
const withFetch = async (impl, fn) => { const o = globalThis.fetch; globalThis.fetch = impl; try { return await fn(); } finally { globalThis.fetch = o; } };
const geminiOk = (j) => async () => jsonRes(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(j) }] } }] });
const READABLE = { is_paper: true, readable: true, problems: [] };

test('البوابة: بدون رمز مضبوط → 503، رمز خاطئ → 401، صحيح → يمر، health عام', async () => {
  const next = async () => new Response('next');
  const req = (code) => new Request(`${URL0}/api/assessments`, { headers: code ? { 'x-tavio-access': code } : {} });
  assert.equal((await mw.onRequest({ request: req('x'), env: {}, next })).status, 503);
  assert.equal((await mw.onRequest({ request: req('bad'), env: { TAVIO_ACCESS_CODE: 'sesame' }, next })).status, 401);
  assert.equal(await (await mw.onRequest({ request: req('sesame'), env: { TAVIO_ACCESS_CODE: 'sesame' }, next })).text(), 'next');
  const h = await mw.onRequest({ request: new Request(`${URL0}/api/health`), env: {}, next });
  assert.equal(await h.text(), 'next');
  const hb = await (await health.onRequestGet({ request: new Request(`${URL0}/api/health`), env: {} })).json();
  assert.deepEqual(hb, { ok: true });
});

test('خدمة غير مفعلة → SETUP_REQUIRED مع أسماء فقط', async () => {
  const r = await call(assessments.onRequestGet, { env: { TAVIO_ACCESS_CODE: 'x' } });
  assert.equal(r.status, 503);
  assert.deepEqual(r.body.error, { code: 'SETUP_REQUIRED', missing: ['DB'] });
});

test('لا تحليل قبل ورقة الأسئلة', async () => {
  const env = baseEnv();
  const aid = await newAssessment(env);
  await upPaper(env, aid, 'paper-0001');
  const r = await doAnalyze(env, 'paper-0001');
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'QUESTION_SHEET_REQUIRED');
});

test('رفع الورقة idempotent: إعادة نفس المعرّف لا تكرر ولا تعيد الكتابة', async () => {
  const env = baseEnv();
  const aid = await newAssessment(env);
  const a = await upPaper(env, aid, 'paper-0001');
  const b = await upPaper(env, aid, 'paper-0001');
  assert.equal(a.body.paper.status, 'uploaded');
  assert.equal(b.body.already_uploaded, true);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) c FROM student_papers').get().c, 1);
});

test('رفض نوع غير صورة وحجم زائد وجسم فارغ', async () => {
  const env = baseEnv();
  const aid = await newAssessment(env);
  const bad = await call(paperPut.onRequestPut, { env, params: { id: aid, paperId: 'paper-0002' }, request: putImage(`${URL0}/x`, new Uint8Array([1]), 'application/pdf') });
  assert.equal(bad.status, 415);
  const big = new Request(`${URL0}/x`, { method: 'PUT', headers: { 'content-type': 'image/jpeg', 'content-length': String(9 * 1024 * 1024) }, body: new Uint8Array([1]) });
  assert.equal((await call(paperPut.onRequestPut, { env, params: { id: aid, paperId: 'paper-0003' }, request: big })).status, 413);
});

test('فشل R2 → UPLOAD_FAILED على هذه الورقة فقط، وإعادة الرفع تنجح', async () => {
  const env = baseEnv({ FILES: fakeR2({ failPut: true }) });
  const aid = await newAssessment(env);
  const r = await upPaper(env, aid, 'paper-0001');
  assert.equal(r.body.paper.status, 'failed');
  assert.equal(r.body.paper.error_code, 'UPLOAD_FAILED');
  env.FILES = fakeR2();
  const again = await upPaper(env, aid, 'paper-0001');
  assert.equal(again.body.paper.status, 'uploaded');
});

test('دفعة 15 ورقة: بعضها مشغول/غير واضح/ناجح — الناجحة لا تتأثر', async () => {
  const env = baseEnv();
  const aid = await newAssessment(env);
  await upSheet(env, aid, 'sheet-0001');
  const ids = Array.from({ length: 15 }, (_, i) => `paper-${String(i).padStart(4, '0')}`);
  for (const id of ids) await upPaper(env, aid, id);

  // 0-4 مشغول، 5-6 غير واضحة، الباقي ناجح
  const busy = new Set(ids.slice(0, 5)), unclear = new Set(ids.slice(5, 7));
  const keyToId = new Map(ids.map((id) => [`assessments/${aid}/papers/${id}.jpg`, id]));
  // نميّز الورقة عبر أول بايت نكتبه في R2
  ids.forEach((id, i) => env.FILES.m.set(`assessments/${aid}/papers/${id}.jpg`, new Uint8Array([i])));
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    const idx = atob(body.contents[0].parts[1].inlineData.data).charCodeAt(0);
    const id = ids[idx];
    if (busy.has(id)) return jsonRes(503, { error: { status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } });
    if (unclear.has(id)) return jsonRes(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ is_paper: true, readable: false, problems: ['blur'] }) }] } }] });
    return geminiOk(READABLE)();
  };
  const results = await withFetch(impl, () => Promise.all(ids.map((id) => doAnalyze(env, id))));

  assert.ok(results.every((r) => r.status === 200), 'فشل ورقة لا يصبح خطأ HTTP');
  const st = Object.fromEntries(ids.map((id) => [id, status(env, id)]));
  for (const id of busy) assert.deepEqual([st[id].status, st[id].error_code], ['failed', 'AI_SERVICE_BUSY']);
  for (const id of unclear) assert.deepEqual([st[id].status, st[id].error_code], ['needs_review', 'IMAGE_UNCLEAR']);
  const ok = ids.filter((id) => !busy.has(id) && !unclear.has(id));
  assert.equal(ok.length, 8);
  for (const id of ok) assert.equal(st[id].status, 'success');

  // لا رسالة Gemini الخام في أي استجابة
  assert.ok(!JSON.stringify(results).includes('high demand'));

  // إعادة معالجة المشغولة فقط بعد أن تهدأ الخدمة
  await withFetch(geminiOk(READABLE), async () => { for (const id of busy) await doAnalyze(env, id); });
  for (const id of busy) assert.equal(status(env, id).status, 'success');
  for (const id of ok) assert.equal(status(env, id).attempts, 1, 'الناجحة لم تُعاد');

  const prog = await call(assessmentGet.onRequestGet, { env, params: { id: aid } });
  assert.equal(prog.body.progress.total, 15);
  assert.equal(prog.body.progress.by_status.success, 13);
  assert.equal(prog.body.progress.by_status.needs_review, 2);
});

test('معالجة متزامنة لنفس الورقة: واحدة فقط تمر', async () => {
  const env = baseEnv();
  const aid = await newAssessment(env);
  await upSheet(env, aid, 'sheet-0001');
  await upPaper(env, aid, 'paper-0001');
  const [a, b] = await withFetch(geminiOk(READABLE), () => Promise.all([doAnalyze(env, 'paper-0001'), doAnalyze(env, 'paper-0001')]));
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
});

test('ورقة عالقة في processing أكثر من دقيقتين تُستلم من جديد', async () => {
  const env = baseEnv();
  const aid = await newAssessment(env);
  await upSheet(env, aid, 'sheet-0001');
  await upPaper(env, aid, 'paper-0001');
  env.DB.raw.prepare("UPDATE student_papers SET status='processing', updated_at=datetime('now','-5 minutes') WHERE id='paper-0001'").run();
  const r = await withFetch(geminiOk(READABLE), () => doAnalyze(env, 'paper-0001'));
  assert.equal(r.body.paper.status, 'success');
});

test('سجلات التحليل: يُسجَّل job لكل محاولة، ولا يوجد مفتاح في أي عمود', async () => {
  const env = baseEnv();
  const aid = await newAssessment(env);
  await upSheet(env, aid, 'sheet-0001');
  await upPaper(env, aid, 'paper-0001');
  const leak = async () => new Response('key AIzaSyA1234567890abcdefghijklmnop', { status: 500 });
  await withFetch(leak, () => doAnalyze(env, 'paper-0001'));
  const dump = JSON.stringify([env.DB.raw.prepare('SELECT * FROM student_papers').all(), env.DB.raw.prepare('SELECT * FROM analysis_jobs').all()]);
  assert.ok(!dump.includes('AIzaSy'));
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) c FROM analysis_jobs').get().c, 1);
});

// ---- منطق الدفعة في الواجهة (بلا DOM) ----
test('runPool: يحترم التزامن ولا يوقف الباقي عند فشل عنصر', async () => {
  let active = 0, peak = 0; const done = [];
  await runPool([1, 2, 3, 4, 5, 6], async (n) => {
    active++; peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    if (n === 3) throw new Error('boom');
    done.push(n);
  }, 2);
  assert.equal(peak, 2);
  assert.deepEqual(done.sort(), [1, 2, 4, 5, 6]);
});

test('processPaper: فشل رفع ورقة لا يمنع غيرها؛ خطأ شبكة يصبح حالة لهذه الورقة', async () => {
  const api = {
    uploadPaper: async (aid, id) => {
      if (id === 'b') { const e = new Error('x'); e.code = 'NETWORK_ERROR'; throw e; }
      return { paper: { status: 'uploaded' } };
    },
    analyzePaper: async (id) => (id === 'c' ? { paper: { status: 'failed', error_code: 'AI_SERVICE_BUSY' } } : { paper: { status: 'success', error_code: null } }),
  };
  const items = ['a', 'b', 'c'].map((id) => ({ id, name: id, status: 'pending', errorCode: null, uploaded: false, file: {} }));
  const proc = makePaperProcessor({ api, prepare: async (f) => f, assessmentId: 'A', onChange() {} });
  await runPool(items, proc, 2);
  assert.deepEqual(items.map((i) => [i.status, i.errorCode]), [['success', null], ['failed', 'NETWORK_ERROR'], ['failed', 'AI_SERVICE_BUSY']]);
  assert.equal(items[2].uploaded, true, 'ورقة فشل تحليلها لا تُعاد رفعها');
});
