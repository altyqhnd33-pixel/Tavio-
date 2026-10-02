// المصدر الوحيد للثوابت — تستورده الواجهة والخادم معًا.
// لا تضف هنا نصوصًا تُعرض للمستخدم (مكانها public/js/messages.js).

export const PAPER_STATUS = Object.freeze({
  PENDING: 'pending',           // اختارها المعلم ولم يبدأ رفعها بعد (جهة الواجهة)
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',             // فشل تقني — غالبًا يمكن إعادة المحاولة
  NEEDS_REVIEW: 'needs_review', // يحتاج قرار/تأكيد المعلم
});

// الانتقالات المسموحة فقط. أي انتقال آخر يُرفض في الخادم.
export const PAPER_TRANSITIONS = Object.freeze({
  pending: ['uploading'],
  uploading: ['uploaded', 'failed'],
  uploaded: ['processing'],
  processing: ['success', 'failed', 'needs_review'],
  success: ['processing'],                    // إعادة معالجة صريحة
  failed: ['uploading', 'processing'],        // إعادة رفع أو إعادة تحليل
  needs_review: ['processing', 'success'],    // إعادة تحليل أو تأكيد المعلم
});

export function canTransition(from, to) {
  return (PAPER_TRANSITIONS[from] || []).includes(to);
}

// رموز الأخطاء الداخلية في TAVIO. لا يُعرض نص Gemini الخام أبدًا.
export const ERROR_CODE = Object.freeze({
  IMAGE_UNCLEAR: 'IMAGE_UNCLEAR',
  AI_SERVICE_BUSY: 'AI_SERVICE_BUSY',
  AI_RATE_LIMIT: 'AI_RATE_LIMIT',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_ERROR: 'AI_ERROR',
  IDENTIFICATION_UNCERTAIN: 'IDENTIFICATION_UNCERTAIN',
  QUESTION_UNCERTAIN: 'QUESTION_UNCERTAIN',
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  UPLOAD_FAILED: 'UPLOAD_FAILED', // إضافة مني: فشل الرفع/التخزين ليس فشل ذكاء اصطناعي
});

// لكل رمز: الحالة التي تنتهي بها الورقة، وهل تنفع إعادة المحاولة كما هي.
export const ERROR_META = Object.freeze({
  IMAGE_UNCLEAR:            { status: 'needs_review', retryable: false },
  AI_SERVICE_BUSY:          { status: 'failed',       retryable: true },
  AI_RATE_LIMIT:            { status: 'failed',       retryable: true },
  AI_TIMEOUT:               { status: 'failed',       retryable: true },
  AI_ERROR:                 { status: 'failed',       retryable: true },
  IDENTIFICATION_UNCERTAIN: { status: 'needs_review', retryable: false },
  QUESTION_UNCERTAIN:       { status: 'needs_review', retryable: false },
  ANALYSIS_FAILED:          { status: 'failed',       retryable: true },
  NEEDS_REVIEW:             { status: 'needs_review', retryable: false },
  UPLOAD_FAILED:            { status: 'failed',       retryable: true },
});

// تصنيفات الخطأ المتفق عليها (تصنيف أدلة/نمط وليس تشخيصًا).
export const ERROR_CATEGORY = Object.freeze([
  'concept', 'application', 'procedural', 'transfer',
  'language_reading', 'attention', 'unspecified',
]);

export const EVIDENCE_RESULT = Object.freeze(['correct', 'incorrect', 'partial', 'unknown']);

export const LIMITS = Object.freeze({
  MAX_IMAGE_BYTES: 8 * 1024 * 1024,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
});
