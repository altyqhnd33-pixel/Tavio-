import { handle } from '../../src/server/http.js';
import { requireAccess } from '../../src/server/access.js';

// كل /api محمي برمز الوصول عدا /api/health.
export const onRequest = handle(async (context) => {
  if (new URL(context.request.url).pathname !== '/api/health') {
    await requireAccess(context.request, context.env);
  }
  return context.next();
});
