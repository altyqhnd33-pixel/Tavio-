import { HttpError } from './http.js';

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

// مقارنة بزمن ثابت عبر تجزئة الطرفين أولًا.
export async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

// بوابة وصول بسيطة: رمز مشترك للمعلم في TAVIO_ACCESS_CODE.
// إن لم يُضبط الرمز يُرفض كل شيء (fail closed) حتى لا يصبح الخادم وكيلًا مفتوحًا لـ Gemini.
export async function requireAccess(request, env) {
  if (!env.TAVIO_ACCESS_CODE) throw new HttpError(503, 'SETUP_REQUIRED', { missing: ['TAVIO_ACCESS_CODE'] });
  const given = request.headers.get('x-tavio-access') || '';
  if (!(await safeEqual(given, env.TAVIO_ACCESS_CODE))) throw new HttpError(401, 'ACCESS_DENIED');
}
