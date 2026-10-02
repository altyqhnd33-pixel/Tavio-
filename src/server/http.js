import { TavioError } from './errors.js';

export class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// يلفّ أي handler: أخطاء الطلب تتحول إلى JSON بنص آمن، وأي استثناء غير متوقع يُسجَّل بلا بيانات حساسة.
export function handle(fn) {
  return async (context) => {
    try {
      return await fn(context);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ ok: false, error: { code: err.code, ...err.extra } }, err.status);
      }
      if (err instanceof TavioError) {
        return json({ ok: false, error: { code: err.code, retryable: err.retryable } }, 502);
      }
      console.error('unhandled', err?.name, String(err?.message || '').slice(0, 200));
      return json({ ok: false, error: { code: 'INTERNAL' } }, 500);
    }
  };
}

// يتأكد من وجود الخدمات المطلوبة ويقول أيّها ينقص (أسماء فقط، لا قيم).
export function requireBindings(env, names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) throw new HttpError(503, 'SETUP_REQUIRED', { missing });
}

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
export function validId(id) {
  if (!ID_RE.test(id || '')) throw new HttpError(400, 'BAD_ID');
  return id;
}

export const newId = () => crypto.randomUUID();
