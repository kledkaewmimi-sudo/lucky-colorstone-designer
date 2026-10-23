import fs from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './app-root.mjs';

export function writeEvidence(relativePath, value) {
  const target = path.resolve(REPO_ROOT, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return target;
}

export function nowIso() {
  return new Date().toISOString();
}
