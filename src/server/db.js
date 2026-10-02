// كل استعلامات D1 هنا. لا SQL داخل ملفات functions/.

const q = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);

export async function createAssessment(env, id, title) {
  await q(env, 'INSERT INTO assessments (id, title) VALUES (?, ?)', id, title).run();
}
export const listAssessments = async (env) =>
  (await q(env, 'SELECT id, title, created_at FROM assessments ORDER BY created_at DESC LIMIT 30').all()).results;
export const getAssessment = (env, id) =>
  q(env, 'SELECT id, title, created_at FROM assessments WHERE id = ?', id).first();

export async function addQuestionSheetFile(env, { id, assessmentId, key, contentType, size }) {
  await q(env,
    `INSERT INTO assessment_files (id, assessment_id, kind, r2_key, content_type, size_bytes)
     VALUES (?, ?, 'question_sheet', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET r2_key = excluded.r2_key, content_type = excluded.content_type, size_bytes = excluded.size_bytes
     WHERE assessment_files.assessment_id = excluded.assessment_id`,
    id, assessmentId, key, contentType, size).run();
}
export const countQuestionSheetFiles = async (env, assessmentId) =>
  (await q(env, "SELECT COUNT(*) AS c FROM assessment_files WHERE assessment_id = ? AND kind = 'question_sheet'", assessmentId).first()).c;

export const getPaper = (env, id) => q(env, 'SELECT * FROM student_papers WHERE id = ?', id).first();

// يسجّل الورقة قبل رفعها. الاستدعاء المتكرر بنفس المعرّف آمن (idempotent).
// يُرجع true إذا أصبحت الورقة في حالة uploading وعلينا رفعها، وfalse إذا كانت مرفوعة سابقًا.
export async function beginPaperUpload(env, { id, assessmentId, originalName, contentType }) {
  const res = await q(env,
    `INSERT INTO student_papers (id, assessment_id, status, original_name, content_type)
     VALUES (?, ?, 'uploading', ?, ?)
     ON CONFLICT(id) DO UPDATE SET status = 'uploading', error_code = NULL, error_internal = NULL,
       original_name = excluded.original_name, content_type = excluded.content_type, updated_at = datetime('now')
     WHERE student_papers.assessment_id = excluded.assessment_id
       AND student_papers.status IN ('failed', 'uploading', 'pending')`,
    id, assessmentId, originalName, contentType).run();
  return res.meta.changes > 0;
}
export async function markPaperUploaded(env, { id, key, size }) {
  await q(env,
    `UPDATE student_papers SET status = 'uploaded', r2_key = ?, size_bytes = ?, error_code = NULL,
       error_internal = NULL, updated_at = datetime('now') WHERE id = ? AND status = 'uploading'`,
    key, size, id).run();
}
export async function markPaperFailed(env, { id, code, internal }) {
  await q(env,
    `UPDATE student_papers SET status = 'failed', error_code = ?, error_internal = ?, updated_at = datetime('now') WHERE id = ?`,
    code, internal || null, id).run();
}

// يحجز الورقة للمعالجة بشرط ذري. false = ورقة أخرى تعالجها الآن أو حالتها لا تسمح.
// processing أقدم من دقيقتين يُعتبر عالقًا (انقطع العامل) ويمكن استلامه.
export async function claimPaperForProcessing(env, id) {
  const res = await q(env,
    `UPDATE student_papers SET status = 'processing', error_code = NULL, error_internal = NULL,
       attempts = attempts + 1, updated_at = datetime('now')
     WHERE id = ? AND r2_key IS NOT NULL AND (
       status IN ('uploaded', 'failed', 'needs_review', 'success')
       OR (status = 'processing' AND updated_at < datetime('now', '-2 minutes')))`,
    id).run();
  return res.meta.changes > 0;
}
export async function finishPaper(env, { id, status, code = null, internal = null }) {
  await q(env,
    `UPDATE student_papers SET status = ?, error_code = ?, error_internal = ?, updated_at = datetime('now') WHERE id = ?`,
    status, code, internal, id).run();
}

export async function startJob(env, { id, paperId, assessmentId, stage }) {
  await q(env, `INSERT INTO analysis_jobs (id, paper_id, assessment_id, stage, status) VALUES (?, ?, ?, ?, 'running')`,
    id, paperId, assessmentId, stage).run();
}
export async function finishJob(env, { id, status, code = null, attempts = 0, result = null }) {
  await q(env,
    `UPDATE analysis_jobs SET status = ?, error_code = ?, attempts = ?, result_json = ?, finished_at = datetime('now') WHERE id = ?`,
    status, code, attempts, result ? JSON.stringify(result) : null, id).run();
}

export const listPapers = async (env, assessmentId) =>
  (await q(env,
    `SELECT id, status, error_code, attempts, original_name, student_id, updated_at
     FROM student_papers WHERE assessment_id = ? ORDER BY created_at`, assessmentId).all()).results;

export async function paperProgress(env, assessmentId) {
  const rows = (await q(env,
    'SELECT status, COUNT(*) AS c FROM student_papers WHERE assessment_id = ? GROUP BY status', assessmentId).all()).results;
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.c]));
  return { total: rows.reduce((n, r) => n + r.c, 0), by_status: byStatus };
}
