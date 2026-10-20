import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// Wrangler Pages does not bind a parent --env-file as context.env secrets.
// Copy only this one server secret. Never log its value or expose it to Vite.
export async function prepareChatEnv(envPath, varsPath) {
  const source = parseEnv(await readFile(envPath, 'utf8'));
  const key = source.OPENAI_API_KEY?.trim();
  if (!key || !/^sk-[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('Add a valid OPENAI_API_KEY to codebase/.env. Do not use a VITE_ prefix.');
  }
  let existing = {};
  try { existing = parseEnv(await readFile(varsPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  existing.OPENAI_API_KEY = key;
  const contents = Object.entries(existing).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n') + '\n';
  await writeFile(varsPath, contents, { mode: 0o600 });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    await prepareChatEnv(resolve(appDir, '../.env'), resolve(appDir, '.dev.vars'));
    console.log('Server secret loaded. No key value was printed.');
  } catch (error) {
    console.error(error.code === 'ENOENT' ? 'Create codebase/.env with OPENAI_API_KEY before starting chat.' : 'Could not load the server secret. Check OPENAI_API_KEY in codebase/.env.');
    process.exitCode = 1;
  }
}
