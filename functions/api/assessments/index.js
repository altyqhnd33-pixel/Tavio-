import { handle, json, requireBindings, HttpError, newId } from '../../../src/server/http.js';
import { createAssessment, listAssessments } from '../../../src/server/db.js';

export const onRequestGet = handle(async ({ env }) => {
  requireBindings(env, ['DB']);
  return json({ ok: true, assessments: await listAssessments(env) });
});

export const onRequestPost = handle(async ({ request, env }) => {
  requireBindings(env, ['DB']);
  const body = await request.json().catch(() => null);
  const title = String(body?.title ?? '').trim().slice(0, 120);
  if (!title) throw new HttpError(400, 'TITLE_REQUIRED');
  const id = newId();
  await createAssessment(env, id, title);
  return json({ ok: true, assessment: { id, title } }, 201);
});
