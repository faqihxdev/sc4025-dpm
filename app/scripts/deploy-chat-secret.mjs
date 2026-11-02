import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// Only this server key goes to the existing project's production secret binding.
// Use stdin, never command arguments, a temporary file or a frontend variable.
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const key = parseEnv(await readFile(resolve(appDir, '../.env'), 'utf8')).OPENAI_API_KEY?.trim();
  if (!key || !/^sk-[A-Za-z0-9_-]+$/.test(key)) throw new Error('Missing server key.');
  const args = ['--yes', 'wrangler@4.146.0', 'pages', 'secret', 'bulk', '--project-name', 'fmd'];
  const windows = process.platform === 'win32';
  const child = spawn(windows ? 'cmd.exe' : 'npx', windows ? ['/d', '/s', '/c', `npx ${args.join(' ')}`] : args, {
    cwd: appDir, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, CI: 'true' },
  });
  for (const output of [child.stdout, child.stderr]) {
    output.on('data', data => process.stdout.write(data.toString().replaceAll(key, '[redacted]')));
  }
  child.stdin.on('error', () => {});
  const exitCode = new Promise((resolveExit, reject) => {
    child.on('error', () => reject(new Error('Cloudflare CLI could not start.')));
    child.on('close', code => resolveExit(code));
  });
  child.stdin.end(`${JSON.stringify({ OPENAI_API_KEY: key })}\n`);
  if (await exitCode !== 0) throw new Error('Cloudflare secret upload failed.');
  console.log('Production server secret installed. No key value was printed.');
} catch {
  console.error('Could not install the production secret. Check the root .env and Cloudflare login.');
  process.exitCode = 1;
}
