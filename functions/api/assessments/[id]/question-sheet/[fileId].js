import { handle, json, requireBindings, HttpError, validId } from '../../../../../src/server/http.js';
import { getAssessment, addQuestionSheetFile } from '../../../../../src/server/db.js';
import { readImageBody, questionSheetKey } from '../../../../../src/server/storage.js';

// PUT /api/assessments/:id/question-sheet/:fileId — صورة واحدة من ورقة الأسئلة (يمكن عدة صفحات).
export const onRequestPut = handle(async ({ request, env, params }) => {
  requireBindings(env, ['DB', 'FILES']);
  const assessmentId = validId(params.id);
  const fileId = validId(params.fileId);
  if (!(await getAssessment(env, assessmentId))) throw new HttpError(404, 'ASSESSMENT_NOT_FOUND');

  const { bytes, contentType } = await readImageBody(request);
  const key = questionSheetKey(assessmentId, fileId, contentType);
  try {
    await env.FILES.put(key, bytes, { httpMetadata: { contentType } });
  } catch (e) {
    console.error('r2 put failed (question sheet)', String(e?.message || '').slice(0, 200));
    throw new HttpError(502, 'UPLOAD_FAILED', { retryable: true });
  }
  await addQuestionSheetFile(env, { id: fileId, assessmentId, key, contentType, size: bytes.byteLength });
  return json({ ok: true, file: { id: fileId } });
});
