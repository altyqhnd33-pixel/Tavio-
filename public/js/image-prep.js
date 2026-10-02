// صور الهاتف كبيرة (5–10MB). نصغّرها قبل الرفع لتسريع الرفع وتقليل حمل الخادم وGemini.
const SKIP_BELOW = 1.5 * 1024 * 1024;

export async function prepareImage(file, { maxSide = 2000, quality = 0.85 } = {}) {
  const okType = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  if (okType && file.size <= SKIP_BELOW) return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('UNSUPPORTED_IMAGE');
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  if (!blob) throw new Error('UNSUPPORTED_IMAGE');
  return blob;
}
