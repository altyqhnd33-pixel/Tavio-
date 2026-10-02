import { LIMITS } from '../../public/js/shared/constants.js';
import { HttpError } from './http.js';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function paperKey(assessmentId, paperId, contentType) {
  return `assessments/${assessmentId}/papers/${paperId}.${EXT[contentType]}`;
}
export function questionSheetKey(assessmentId, fileId, contentType) {
  return `assessments/${assessmentId}/question-sheet/${fileId}.${EXT[contentType]}`;
}

// يقرأ جسم طلب الصورة ويتحقق من النوع والحجم. يُرجع { bytes, contentType }.
export async function readImageBody(request) {
  const contentType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!LIMITS.ALLOWED_IMAGE_TYPES.includes(contentType)) throw new HttpError(415, 'UNSUPPORTED_IMAGE_TYPE');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > LIMITS.MAX_IMAGE_BYTES) throw new HttpError(413, 'IMAGE_TOO_LARGE');
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) throw new HttpError(400, 'EMPTY_BODY');
  if (bytes.byteLength > LIMITS.MAX_IMAGE_BYTES) throw new HttpError(413, 'IMAGE_TOO_LARGE');
  return { bytes, contentType };
}
