import { ERROR_CODE, ERROR_META } from '../../public/js/shared/constants.js';

// خطأ تفهمه TAVIO. `internal` للسجلات فقط ولا يصل للمستخدم.
export class TavioError extends Error {
  constructor(code, { internal = '', retryAfterMs = null, httpStatus = null } = {}) {
    super(code);
    this.name = 'TavioError';
    this.code = code;
    this.internal = sanitizeInternal(internal);
    this.retryAfterMs = retryAfterMs;
    this.httpStatus = httpStatus;
    this.retryable = ERROR_META[code]?.retryable ?? false;
  }
}

// يمنع تسرّب المفاتيح إلى السجلات/قاعدة البيانات ويقصّ النص.
export function sanitizeInternal(text, max = 400) {
  return String(text ?? '')
    .replace(/AIza[0-9A-Za-z_\-]{20,}/g, '[redacted-key]')
    .replace(/(api[_-]?key["'\s:=]+)[^\s"',}]+/gi, '$1[redacted]')
    .slice(0, max);
}

// ترجمة استجابة خطأ HTTP من Gemini إلى حالة TAVIO مفهومة.
export function mapGeminiHttpError(status, bodyText = '', headers = null) {
  let msg = '';
  let gstatus = '';
  try {
    const j = JSON.parse(bodyText);
    msg = j?.error?.message || '';
    gstatus = j?.error?.status || '';
  } catch { msg = bodyText; }
  const blob = `${gstatus} ${msg}`;
  const internal = `gemini http ${status} ${gstatus} ${msg}`;

  let retryAfterMs = null;
  const ra = headers?.get?.('retry-after');
  if (ra && /^\d+$/.test(ra)) retryAfterMs = Number(ra) * 1000;

  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(gstatus)) {
    return new TavioError(ERROR_CODE.AI_RATE_LIMIT, { internal, retryAfterMs });
  }
  if (status === 503 || /UNAVAILABLE/i.test(gstatus) || /high demand|overloaded/i.test(blob)) {
    return new TavioError(ERROR_CODE.AI_SERVICE_BUSY, { internal, retryAfterMs });
  }
  if (status === 504 || /DEADLINE_EXCEEDED/i.test(gstatus)) {
    return new TavioError(ERROR_CODE.AI_TIMEOUT, { internal });
  }
  if (status === 400 && /api key/i.test(blob)) {
    return new TavioError(ERROR_CODE.AI_ERROR, { internal: `config: ${internal}` });
  }
  if (status === 400 && /image|mime/i.test(blob)) {
    return new TavioError(ERROR_CODE.IMAGE_UNCLEAR, { internal });
  }
  return new TavioError(ERROR_CODE.AI_ERROR, { internal });
}

// أي استثناء غير متوقع → TavioError. المهلة (AbortError) → AI_TIMEOUT.
export function toTavioError(err) {
  if (err instanceof TavioError) return err;
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') {
    return new TavioError(ERROR_CODE.AI_TIMEOUT, { internal: 'request aborted by timeout' });
  }
  return new TavioError(ERROR_CODE.ANALYSIS_FAILED, { internal: err?.message || String(err) });
}
