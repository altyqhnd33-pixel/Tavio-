const KEY = 'tavio.access';

export const getAccess = () => localStorage.getItem(KEY) || '';
export const setAccess = (v) => localStorage.setItem(KEY, v);
export const clearAccess = () => localStorage.removeItem(KEY);

export class ApiError extends Error {
  constructor(code, status = 0, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

async function call(path, { method = 'GET', body, headers = {}, json } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: {
        'x-tavio-access': getAccess(),
        ...(json !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : body,
    });
  } catch {
    throw new ApiError('NETWORK_ERROR');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) {
    const e = data?.error || {};
    throw new ApiError(e.code || 'INTERNAL', res.status, e);
  }
  return data;
}

export const api = {
  health: () => call('/health'),
  listAssessments: () => call('/assessments'),
  createAssessment: (title) => call('/assessments', { method: 'POST', json: { title } }),
  getAssessment: (id) => call(`/assessments/${id}`),
  uploadQuestionSheet: (aid, fileId, blob) =>
    call(`/assessments/${aid}/question-sheet/${fileId}`, { method: 'PUT', body: blob, headers: { 'content-type': blob.type } }),
  uploadPaper: (aid, paperId, blob, name) =>
    call(`/assessments/${aid}/papers/${paperId}`, {
      method: 'PUT', body: blob,
      headers: { 'content-type': blob.type, 'x-original-name': encodeURIComponent(name || '') },
    }),
  analyzePaper: (paperId) => call(`/papers/${paperId}/analyze`, { method: 'POST' }),
};
