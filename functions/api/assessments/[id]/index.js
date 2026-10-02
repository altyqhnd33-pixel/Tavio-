import { handle, json, requireBindings, HttpError, validId } from '../../../../src/server/http.js';
import { getAssessment, listPapers, paperProgress, countQuestionSheetFiles } from '../../../../src/server/db.js';

// حالة التقييم كاملة: تُستخدم للتحديث الدوري واستئناف العمل بعد إعادة فتح الصفحة.
export const onRequestGet = handle(async ({ env, params }) => {
  requireBindings(env, ['DB']);
  const id = validId(params.id);
  const assessment = await getAssessment(env, id);
  if (!assessment) throw new HttpError(404, 'ASSESSMENT_NOT_FOUND');
  const [papers, progress, sheets] = await Promise.all([
    listPapers(env, id), paperProgress(env, id), countQuestionSheetFiles(env, id),
  ]);
  return json({ ok: true, assessment, question_sheet_files: sheets, progress, papers });
});
