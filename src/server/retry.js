import { toTavioError } from './errors.js';

const sleepDefault = (ms) => new Promise((r) => setTimeout(r, ms));

// إعادة محاولة محدودة للأخطاء المؤقتة فقط. يُرجع { value, attempts } أو يرمي TavioError عليه .attempts.
export async function withRetry(fn, {
  maxAttempts = 3,
  baseDelayMs = 800,
  maxDelayMs = 6000,
  maxRetryAfterMs = 6000, // لا ننتظر rate limit أطول من هذا داخل طلب واحد
  sleep = sleepDefault,
  random = Math.random,
} = {}) {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      const value = await fn(attempt);
      return { value, attempts: attempt };
    } catch (raw) {
      const err = toTavioError(raw);
      err.attempts = attempt;
      const tooLongToWait = err.retryAfterMs != null && err.retryAfterMs > maxRetryAfterMs;
      if (!err.retryable || attempt >= maxAttempts || tooLongToWait) throw err;
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const delay = err.retryAfterMs ?? Math.round(backoff * (0.5 + random() / 2));
      await sleep(delay);
    }
  }
}
