import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './helpers.js';

const C = await loadModule('public/js/shared/constants.js');
const E = await loadModule('src/server/errors.js');
const { withRetry } = await loadModule('src/server/retry.js');
const { generateContent } = await loadModule('src/server/gemini/client.js');
const { safeEqual } = await loadModule('src/server/access.js');

test('انتقالات الحالة: المسموح والممنوع', () => {
  assert.ok(C.canTransition('uploaded', 'processing'));
  assert.ok(C.canTransition('failed', 'processing'));
  assert.ok(!C.canTransition('uploaded', 'success'));
  assert.ok(!C.canTransition('pending', 'processing'));
});

test('كل رمز خطأ له meta', () => {
  for (const code of Object.values(C.ERROR_CODE)) assert.ok(C.ERROR_META[code], code);
});

test('"high demand" من Gemini → AI_SERVICE_BUSY وليس IMAGE_UNCLEAR', () => {
  const body = JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'This model is currently experiencing high demand.' } });
  const e = E.mapGeminiHttpError(503, body);
  assert.equal(e.code, 'AI_SERVICE_BUSY');
  assert.equal(e.retryable, true);
  assert.notEqual(e.message, 'This model is currently experiencing high demand.');
});

test('تعيين باقي أخطاء Gemini', () => {
  const m = (s, st = '', msg = '') => E.mapGeminiHttpError(s, JSON.stringify({ error: { status: st, message: msg } })).code;
  assert.equal(m(429, 'RESOURCE_EXHAUSTED'), 'AI_RATE_LIMIT');
  assert.equal(m(504, 'DEADLINE_EXCEEDED'), 'AI_TIMEOUT');
  assert.equal(m(400, 'INVALID_ARGUMENT', 'API key not valid'), 'AI_ERROR');
  assert.equal(m(400, 'INVALID_ARGUMENT', 'Unable to process input image'), 'IMAGE_UNCLEAR');
  assert.equal(m(500, 'INTERNAL'), 'AI_ERROR');
  assert.equal(m(403, 'PERMISSION_DENIED'), 'AI_ERROR');
});

test('Retry-After يُقرأ من الرأس', () => {
  const e = E.mapGeminiHttpError(429, '{}', new Headers({ 'retry-after': '3' }));
  assert.equal(e.retryAfterMs, 3000);
});

test('sanitizeInternal يخفي المفاتيح ويقصّ', () => {
  const s = E.sanitizeInternal('bad key AIzaSyA1234567890abcdefghijklmnop and api_key="secretvalue"');
  assert.ok(!s.includes('AIzaSy') && !s.includes('secretvalue'));
  assert.ok(E.sanitizeInternal('x'.repeat(1000)).length <= 400);
});

const noSleep = { sleep: async () => {}, random: () => 0.5 };

test('retry: مشغول ثم نجاح', async () => {
  let n = 0;
  const r = await withRetry(async () => { n++; if (n < 3) throw new E.TavioError('AI_SERVICE_BUSY'); return 'ok'; }, { maxAttempts: 3, ...noSleep });
  assert.equal(r.value, 'ok'); assert.equal(r.attempts, 3);
});

test('retry: يتوقف بعد الحد ويحمل attempts', async () => {
  let n = 0;
  await assert.rejects(
    withRetry(async () => { n++; throw new E.TavioError('AI_SERVICE_BUSY'); }, { maxAttempts: 2, ...noSleep }),
    (e) => e.code === 'AI_SERVICE_BUSY' && e.attempts === 2);
  assert.equal(n, 2);
});

test('retry: غير القابل للإعادة لا يُعاد', async () => {
  let n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new E.TavioError('IMAGE_UNCLEAR'); }, { maxAttempts: 3, ...noSleep }));
  assert.equal(n, 1);
});

test('retry: rate limit بانتظار طويل لا يُنتظر داخل الطلب', async () => {
  let n = 0;
  await assert.rejects(withRetry(async () => { n++; throw new E.TavioError('AI_RATE_LIMIT', { retryAfterMs: 60000 }); }, { maxAttempts: 3, ...noSleep }));
  assert.equal(n, 1);
});

const env = { GEMINI_API_KEY: 'AIzaSECRETSECRETSECRETSECRET', GEMINI_MODEL: 'm1' };
const okFetch = (text) => async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }));

test('gemini: المفتاح في الرأس وليس في الرابط، والصور inlineData', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return okFetch('{"a":1}')(); };
  const r = await generateContent(env, { prompt: 'p', images: [{ bytes: new Uint8Array([1, 2]), mimeType: 'image/jpeg' }, { bytes: new Uint8Array([3]), mimeType: 'image/png' }], fetchImpl });
  assert.deepEqual(r.json, { a: 1 });
  assert.ok(!seen.url.includes('AIza'));
  assert.equal(seen.init.headers['x-goog-api-key'], env.GEMINI_API_KEY);
  const parts = JSON.parse(seen.init.body).contents[0].parts;
  assert.equal(parts.filter((p) => p.inlineData).length, 2);
});

test('gemini: بدون مفتاح → AI_ERROR', async () => {
  await assert.rejects(generateContent({}, { prompt: 'p' }), (e) => e.code === 'AI_ERROR');
});

test('gemini: 503 high demand → AI_SERVICE_BUSY', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'high demand' } }), { status: 503 });
  await assert.rejects(generateContent(env, { prompt: 'p', fetchImpl }), (e) => e.code === 'AI_SERVICE_BUSY');
});

test('gemini: انتهاء المهلة → AI_TIMEOUT', async () => {
  const fetchImpl = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))));
  await assert.rejects(generateContent(env, { prompt: 'p', timeoutMs: 20, fetchImpl }), (e) => e.code === 'AI_TIMEOUT');
});

test('gemini: رد محجوب أو فارغ → ANALYSIS_FAILED', async () => {
  const blocked = async () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }));
  await assert.rejects(generateContent(env, { prompt: 'p', fetchImpl: blocked }), (e) => e.code === 'ANALYSIS_FAILED');
  const empty = async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'OTHER' }] }));
  await assert.rejects(generateContent(env, { prompt: 'p', fetchImpl: empty }), (e) => e.code === 'ANALYSIS_FAILED');
});

test('gemini: خطأ داخلي لا يحوي المفتاح', async () => {
  const fetchImpl = async () => new Response(`bad key ${env.GEMINI_API_KEY}`, { status: 500 });
  await assert.rejects(generateContent(env, { prompt: 'p', fetchImpl }), (e) => !e.internal.includes('SECRETSECRET'));
});

test('safeEqual', async () => {
  assert.ok(await safeEqual('abc', 'abc'));
  assert.ok(!(await safeEqual('abc', 'abd')));
  assert.ok(!(await safeEqual('', 'abc')));
});
