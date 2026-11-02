import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

// Only an allowlisted server key goes to the project's production secret binding.
// Use stdin, never command arguments, a temporary file or a frontend variable.
const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  const binding = process.argv[2] || 'OPENAI_API_KEY';
  if (!['OPENAI_API_KEY', 'DEMO_ACCESS_CODE', 'DEMO_SESSION_SECRET'].includes(binding)) throw new Error('Unsupported secret.');
  const key = parseEnv(await readFile(resolve(appDir, '../.env'), 'utf8'))[binding]?.trim();
  const valid = binding === 'OPENAI_API_KEY' ? /^sk-[A-Za-z0-9_-]+$/ : binding === 'DEMO_ACCESS_CODE' ? /^\d{6}$/ : /^[A-Za-z0-9_-]{32,128}$/;
  if (!key || !valid.test(key)) throw new Error('Missing server key.');
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
  child.stdin.end(`${JSON.stringify({ [binding]: key })}\n`);
  if (await exitCode !== 0) throw new Error('Cloudflare secret upload failed.');
  console.log('Production server secret installed. No key value was printed.');
} catch {
  console.error('Could not install the production secret. Check the root .env and Cloudflare login.');
  process.exitCode = 1;
}
