-- غير مُطبَّق. يُنقل إلى migrations/ عندما نبدأ مرحلة الأنماط/الفرضيات.
-- كل كيان بحقول قليلة؛ التفاصيل في data_json حتى تتضح الحاجة الفعلية.

CREATE TABLE patterns (
  id TEXT PRIMARY KEY, assessment_id TEXT NOT NULL REFERENCES assessments(id),
  question_id TEXT REFERENCES questions(id), skill TEXT, error_category TEXT,
  student_count INTEGER, evidence_gate TEXT CHECK (evidence_gate IN ('sufficient','insufficient')),
  data_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE pattern_evidence (            -- أي أدلة التقطت النمط
  pattern_id TEXT NOT NULL REFERENCES patterns(id),
  evidence_id TEXT NOT NULL REFERENCES evidence(id),
  PRIMARY KEY (pattern_id, evidence_id)
);
CREATE TABLE hypotheses (
  id TEXT PRIMARY KEY, pattern_id TEXT NOT NULL REFERENCES patterns(id),
  statement TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE verifications (
  id TEXT PRIMARY KEY, hypothesis_id TEXT NOT NULL REFERENCES hypotheses(id),
  task TEXT NOT NULL, outcome TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE interventions (
  id TEXT PRIMARY KEY, verification_id TEXT REFERENCES verifications(id),
  description TEXT NOT NULL, duration_minutes INTEGER, student_ids_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE remeasurements (
  id TEXT PRIMARY KEY, intervention_id TEXT NOT NULL REFERENCES interventions(id),
  assessment_id TEXT REFERENCES assessments(id), data_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE decisions (
  id TEXT PRIMARY KEY, remeasurement_id TEXT NOT NULL REFERENCES remeasurements(id),
  decision TEXT NOT NULL CHECK (decision IN ('continue','change_intervention','next_skill','prerequisite')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
