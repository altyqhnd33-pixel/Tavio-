-- TAVIO — المرحلة 1: ما يُستخدم فعليًا الآن + جدول الدليل المنظم.
-- سلسلة (نمط → فرضية → تحقق → تدخل → إعادة قياس → قرار) في db/future/ ولا تُطبَّق الآن.

CREATE TABLE assessments (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ملفات مرتبطة بالتقييم (حاليًا: صور ورقة الأسئلة). المحتوى نفسه في R2.
CREATE TABLE assessment_files (
  id            TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  kind          TEXT NOT NULL CHECK (kind IN ('question_sheet')),
  r2_key        TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_assessment_files_assessment ON assessment_files(assessment_id);

-- الأسئلة: تُملأ لاحقًا من قراءة ورقة الأسئلة (المرحلة 2). الجدول جاهز فقط.
CREATE TABLE questions (
  id              TEXT PRIMARY KEY,
  assessment_id   TEXT NOT NULL REFERENCES assessments(id),
  number          TEXT NOT NULL,
  text            TEXT,
  expected_answer TEXT,
  solution_method TEXT,
  skill           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_questions_assessment ON questions(assessment_id);

-- الطلاب مستقلون عن التقييم الواحد (خريطة تعلم مستمرة لاحقًا). تُملأ عند تحديد الطالب.
CREATE TABLE students (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ورقة طالب = صورة واحدة بمعرّف وحالة مستقلين. المعرّف يولّده العميل لتكون إعادة الرفع idempotent.
CREATE TABLE student_papers (
  id             TEXT PRIMARY KEY,
  assessment_id  TEXT NOT NULL REFERENCES assessments(id),
  student_id     TEXT REFERENCES students(id),   -- null حتى يتم التحديد
  status         TEXT NOT NULL CHECK (status IN
                   ('pending','uploading','uploaded','processing','success','failed','needs_review')),
  error_code     TEXT,                           -- أحد ERROR_CODE، أو null
  error_internal TEXT,                           -- للمطوّر فقط، مقصوص ومنقّى، لا يُعرض
  attempts       INTEGER NOT NULL DEFAULT 0,     -- محاولات التحليل
  r2_key         TEXT,
  original_name  TEXT,
  content_type   TEXT,
  size_bytes     INTEGER,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_papers_assessment_status ON student_papers(assessment_id, status);

-- محاولة تحليل/مرحلة واحدة على ورقة واحدة.
CREATE TABLE analysis_jobs (
  id            TEXT PRIMARY KEY,
  paper_id      TEXT NOT NULL REFERENCES student_papers(id),
  assessment_id TEXT NOT NULL REFERENCES assessments(id),
  stage         TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('running','success','failed','needs_review')),
  error_code    TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  result_json   TEXT,
  started_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT
);
CREATE INDEX idx_jobs_paper ON analysis_jobs(paper_id);

-- الدليل المنظم (قرار 7). كل حقل غير معروف = NULL ولا يُخترع.
CREATE TABLE evidence (
  id               TEXT PRIMARY KEY,
  assessment_id    TEXT NOT NULL REFERENCES assessments(id),
  paper_id         TEXT NOT NULL REFERENCES student_papers(id),
  student_id       TEXT REFERENCES students(id),
  question_id      TEXT REFERENCES questions(id),
  skill            TEXT,
  raw_answer       TEXT,
  observed_work    TEXT,
  result           TEXT CHECK (result IN ('correct','incorrect','partial','unknown')),
  evidence_text    TEXT,
  confidence       REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  error_category   TEXT CHECK (error_category IN
                     ('concept','application','procedural','transfer','language_reading','attention','unspecified')),
  uncertainty      TEXT,
  source_image_key TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_evidence_paper ON evidence(paper_id);
CREATE INDEX idx_evidence_question ON evidence(question_id);
