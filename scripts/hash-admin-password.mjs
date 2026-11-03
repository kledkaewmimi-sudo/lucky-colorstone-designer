import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createAdminPasswordHash } = require('../server-admin-password.js');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
}

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') return readStdin();
  return new Promise((resolve, reject) => {
    let value = '';
    const stdin = process.stdin;
    const cleanup = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (chunk) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        value += character;
      }
    };
    process.stdout.write(prompt);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

let password = String(process.env.ADMIN_PASSWORD_TO_HASH || '');
if (!password) {
  const first = await readHidden('New CRM admin password: ');
  const confirmation = await readHidden('Confirm new CRM admin password: ');
  if (first !== confirmation) {
    console.error('Passwords do not match.');
    process.exit(2);
  }
  password = first;
}
delete process.env.ADMIN_PASSWORD_TO_HASH;
if (!password) {
  console.error('Provide the new password through ADMIN_PASSWORD_TO_HASH or stdin.');
  process.exit(2);
}

const hash = await createAdminPasswordHash(password);
process.stdout.write(`${hash}\n`);
