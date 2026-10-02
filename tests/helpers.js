import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const root = resolve(import.meta.dirname, '..');
export const loadModule = (rel) => import(pathToFileURL(resolve(root, rel)).href);

// D1 وهمي فوق node:sqlite — يطبّق migrations/0001 الحقيقي.
export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(resolve(root, 'migrations/0001_init.sql'), 'utf8'));
  return {
    raw: db,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
            async first() { return db.prepare(sql).get(...args) ?? null; },
            async all() { return { results: db.prepare(sql).all(...args) }; },
          };
        },
      };
    },
  };
}

export function fakeR2({ failPut = false } = {}) {
  const m = new Map();
  return {
    m,
    async put(key, bytes) { if (failPut) throw new Error('r2 down'); m.set(key, bytes); },
    async get(key) { const b = m.get(key); return b ? { arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } : null; },
  };
}

export const jsonRes = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export function putImage(url, bytes = new Uint8Array([1, 2, 3]), type = 'image/jpeg') {
  return new Request(url, { method: 'PUT', headers: { 'content-type': type }, body: bytes });
}
