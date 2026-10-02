import { json } from '../../src/server/http.js';
import { requireAccess } from '../../src/server/access.js';

// عامّة: { ok } فقط. مع رمز الوصول الصحيح: أيّ الإعدادات موجودة (true/false، بلا قيم).
export async function onRequestGet({ request, env }) {
  let setup;
  try {
    await requireAccess(request, env);
    setup = {
      DB: !!env.DB, FILES: !!env.FILES,
      GEMINI_API_KEY: !!env.GEMINI_API_KEY, TAVIO_ACCESS_CODE: !!env.TAVIO_ACCESS_CODE,
    };
  } catch { /* غير مصرّح: نكتفي بـ ok */ }
  return json({ ok: true, ...(setup ? { setup } : {}) });
}
