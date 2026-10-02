import { handle, json, requireBindings, HttpError, validId, newId } from '../../../../src/server/http.js';
import {
  getPaper, countQuestionSheetFiles, claimPaperForProcessing, finishPaper, startJob, finishJob,
} from '../../../../src/server/db.js';
import { analyzePaper, STAGES } from '../../../../src/server/analysis/service.js';
import { toTavioError, TavioError } from '../../../../src/server/errors.js';
import { ERROR_CODE, ERROR_META } from '../../../../public/js/shared/constants.js';

// POST /api/papers/:paperId/analyze — معالجة ورقة واحدة بشكل مستقل.
// فشل الورقة (Gemini مشغول، صورة غير واضحة...) نتيجة 200 بحالة الورقة، وليس خطأ HTTP،
// حتى لا يتعطل باقي الدفعة. أخطاء الطلب نفسه فقط (404/409/503) ترجع بأكواد HTTP.
export const onRequestPost = handle(async ({ env, params }) => {
  requireBindings(env, ['DB', 'FILES', 'GEMINI_API_KEY']);
  const paperId = validId(params.paperId);
  const paper = await getPaper(env, paperId);
  if (!paper) throw new HttpError(404, 'PAPER_NOT_FOUND');

  // قرار: ورقة الأسئلة أولًا. لا تحليل قبل رفعها.
  if ((await countQuestionSheetFiles(env, paper.assessment_id)) === 0) {
    throw new HttpError(409, 'QUESTION_SHEET_REQUIRED');
  }

  if (!(await claimPaperForProcessing(env, paperId))) {
    const code = paper.status === 'processing' ? 'ALREADY_PROCESSING' : 'NOT_READY';
    throw new HttpError(409, code);
  }

  const jobId = newId();
  const stageNames = STAGES.map((s) => s.name).join('+');
  await startJob(env, { id: jobId, paperId, assessmentId: paper.assessment_id, stage: stageNames });

  try {
    const obj = await env.FILES.get(paper.r2_key);
    if (!obj) throw new TavioError(ERROR_CODE.UPLOAD_FAILED, { internal: 'r2 object missing' });
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const results = await analyzePaper({ env, image: { bytes, mimeType: paper.content_type } });

    await finishPaper(env, { id: paperId, status: 'success' });
    await finishJob(env, { id: jobId, status: 'success', attempts: results[0]?.attempts ?? 1, result: results });
    return json({ ok: true, paper: { id: paperId, status: 'success', error_code: null, retryable: false } });
  } catch (raw) {
    const err = toTavioError(raw);
    const status = ERROR_META[err.code]?.status || 'failed';
    await finishPaper(env, { id: paperId, status, code: err.code, internal: err.internal });
    await finishJob(env, { id: jobId, status, code: err.code, attempts: err.attempts ?? 1 });
    return json({ ok: true, paper: { id: paperId, status, error_code: err.code, retryable: err.retryable } });
  }
});
