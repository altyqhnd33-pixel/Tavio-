import { ERROR_CODE } from '../../../public/js/shared/constants.js';
import { TavioError, mapGeminiHttpError, toTavioError } from '../errors.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export function bytesToBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function parseJsonLoose(text) {
  if (!text) return null;
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { return null; }
}

// استدعاء واحد لـ Gemini. المفتاح من env فقط ويُرسل في header (ليس في الرابط).
// images: [{ bytes: Uint8Array, mimeType }]  — صورة أو عدة صور.
export async function generateContent(env, {
  prompt, images = [], system = null, jsonOutput = true, timeoutMs, fetchImpl = fetch,
}) {
  if (!env.GEMINI_API_KEY) {
    throw new TavioError(ERROR_CODE.AI_ERROR, { internal: 'config: GEMINI_API_KEY missing' });
  }
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const timeout = timeoutMs ?? Number(env.GEMINI_TIMEOUT_MS || 25000);

  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: prompt },
        ...images.map((im) => ({ inlineData: { mimeType: im.mimeType, data: bytesToBase64(im.bytes) } })),
      ],
    }],
    generationConfig: { temperature: 0, ...(jsonOutput ? { responseMimeType: 'application/json' } : {}) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetchImpl(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw mapGeminiHttpError(res.status, await res.text().catch(() => ''), res.headers);

    const data = await res.json();
    if (data?.promptFeedback?.blockReason) {
      throw new TavioError(ERROR_CODE.ANALYSIS_FAILED, { internal: `blocked: ${data.promptFeedback.blockReason}` });
    }
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
    if (!text) {
      throw new TavioError(ERROR_CODE.ANALYSIS_FAILED, { internal: `empty response, finishReason=${cand?.finishReason}` });
    }
    return { text, json: jsonOutput ? parseJsonLoose(text) : null, usage: data.usageMetadata || null };
  } catch (err) {
    throw toTavioError(err);
  } finally {
    clearTimeout(timer);
  }
}
