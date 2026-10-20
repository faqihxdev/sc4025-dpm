import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { prepareChatEnv } from './prepare-chat-env.mjs';

test('binds only the requested secret and preserves existing server bindings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drink-chat-env-'));
  const source = join(dir, '.env'), target = join(dir, '.dev.vars');
  await writeFile(source, 'OPENAI_API_KEY=sk-test_fixture\nUNRELATED_SECRET=keep_out\n');
  await writeFile(target, 'EXISTING_BINDING=retain\nOPENAI_API_KEY=sk-old\n');
  await prepareChatEnv(source, target);
  assert.deepEqual(parseEnv(await readFile(target, 'utf8')), { EXISTING_BINDING: 'retain', OPENAI_API_KEY: 'sk-test_fixture' });
});

test('rejects a missing or frontend-prefixed key without writing secrets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'drink-chat-env-'));
  const source = join(dir, '.env'), target = join(dir, '.dev.vars');
  await writeFile(source, 'VITE_OPENAI_API_KEY=sk-wrong\n');
  await assert.rejects(prepareChatEnv(source, target));
  await assert.rejects(readFile(target), { code: 'ENOENT' });
});
