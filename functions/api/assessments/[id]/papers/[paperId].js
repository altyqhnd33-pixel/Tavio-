import { handle, json, requireBindings, HttpError, validId } from '../../../../../src/server/http.js';
import {
  getAssessment, getPaper, beginPaperUpload, markPaperUploaded, markPaperFailed,
} from '../../../../../src/server/db.js';
import { readImageBody, paperKey } from '../../../../../src/server/storage.js';
import { ERROR_CODE } from '../../../../../public/js/shared/constants.js';

const publicPaper = (p) => ({ id: p.id, status: p.status, error_code: p.error_code, retryable: p.status === 'failed' });

// PUT /api/assessments/:id/papers/:paperId — ورقة طالب واحدة. المعرّف يولّده العميل،
// فإعادة الرفع بعد انقطاع الشبكة آمنة ولا تُنشئ نسخة مكررة.
export const onRequestPut = handle(async ({ request, env, params }) => {
  requireBindings(env, ['DB', 'FILES']);
  const assessmentId = validId(params.id);
  const paperId = validId(params.paperId);
  if (!(await getAssessment(env, assessmentId))) throw new HttpError(404, 'ASSESSMENT_NOT_FOUND');

  const { bytes, contentType } = await readImageBody(request);
  let originalName = request.headers.get('x-original-name') || '';
  try { originalName = decodeURIComponent(originalName); } catch { /* اتركه كما هو */ }
  originalName = originalName.slice(0, 120) || null;

  const mustUpload = await beginPaperUpload(env, { id: paperId, assessmentId, originalName, contentType });
  if (!mustUpload) {
    const existing = await getPaper(env, paperId);
    if (!existing || existing.assessment_id !== assessmentId) throw new HttpError(409, 'PAPER_ID_CONFLICT');
    return json({ ok: true, paper: publicPaper(existing), already_uploaded: true });
  }

  const key = paperKey(assessmentId, paperId, contentType);
  try {
    await env.FILES.put(key, bytes, { httpMetadata: { contentType } });
  } catch (e) {
    await markPaperFailed(env, { id: paperId, code: ERROR_CODE.UPLOAD_FAILED, internal: String(e?.message || 'r2 put failed') });
    return json({ ok: true, paper: { id: paperId, status: 'failed', error_code: ERROR_CODE.UPLOAD_FAILED, retryable: true } });
  }
  await markPaperUploaded(env, { id: paperId, key, size: bytes.byteLength });
  return json({ ok: true, paper: publicPaper(await getPaper(env, paperId)) });
});
