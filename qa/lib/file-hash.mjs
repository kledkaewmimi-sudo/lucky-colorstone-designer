import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function hashFile(filePath) {
  return sha256(fs.readFileSync(filePath));
}

export function manifestFiles(directory, { ignored = [] } = {}) {
  const root = path.resolve(directory);
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (ignored.some((pattern) => relative === pattern || relative.startsWith(`${pattern}/`))) continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(relative);
    }
  };
  walk(root);
  files.sort();
  return {
    root,
    files: files.map((relative) => {
      const bytes = fs.readFileSync(path.join(root, relative));
      return { path: relative, bytes: bytes.length, sha256: sha256(bytes) };
    })
  };
}
