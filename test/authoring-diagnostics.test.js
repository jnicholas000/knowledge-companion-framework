import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { validatePack } from '../src/validator.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const corpusRoot = path.join(repositoryRoot, 'test', 'fixtures', 'invalid-authoring');
const basePack = path.join(corpusRoot, 'base-pack');
const cliPath = path.join(repositoryRoot, 'src', 'cli.js');
const fixedNow = new Date('2026-08-07T18:00:00Z');

async function loadCorpus() {
  return JSON.parse(await fs.readFile(path.join(corpusRoot, 'corpus.json'), 'utf8'));
}

async function materializeCase(entry) {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kcf-invalid-authoring-'));
  const packRoot = path.join(temporaryRoot, 'pack');
  await fs.cp(basePack, packRoot, { recursive: true });
  const target = path.join(packRoot, entry.target);
  const source = await fs.readFile(target, 'utf8');
  assert.ok(source.includes(entry.before), `${entry.case} mutation target must exist`);
  await fs.writeFile(target, source.replace(entry.before, entry.after));
  return { temporaryRoot, packRoot };
}

function findExpectedDiagnostic(result, entry) {
  return result.errors.find((item) =>
    item.code === entry.code
    && item.path === entry.file
    && item.instance_path === entry.instance_path
  );
}

test('the invalid-authoring corpus produces deterministic actionable diagnostics', async (context) => {
  const baseResult = await validatePack(basePack, { now: fixedNow, strict: true });
  assert.equal(baseResult.valid, true, JSON.stringify(baseResult.errors, null, 2));

  for (const entry of await loadCorpus()) {
    await context.test(entry.case, async () => {
      const { temporaryRoot, packRoot } = await materializeCase(entry);
      try {
        const first = await validatePack(packRoot, { now: fixedNow, strict: true });
        const second = await validatePack(packRoot, { now: fixedNow, strict: true });
        assert.equal(first.valid, false);
        assert.deepEqual(second.errors, first.errors);

        const item = findExpectedDiagnostic(first, entry);
        assert.ok(item, JSON.stringify(first.errors, null, 2));
        assert.equal(item.severity, 'error');
        assert.equal(typeof item.message, 'string');
        assert.ok(item.message.length > 0);
        assert.equal(typeof item.guidance, 'string');
        assert.ok(item.guidance.length > 0);
      } finally {
        await fs.rm(temporaryRoot, { recursive: true, force: true });
      }
    });
  }
});

test('malformed front matter remains fail-closed for the malformed record', async () => {
  const entry = (await loadCorpus()).find((item) => item.case === 'parse-failure');
  const { temporaryRoot, packRoot } = await materializeCase(entry);
  try {
    const result = await validatePack(packRoot, { now: fixedNow, strict: true });
    const recordDiagnostics = result.errors.filter((item) => item.path === entry.file);
    assert.deepEqual(recordDiagnostics.map((item) => item.code), ['parse.invalid']);
    assert.equal(recordDiagnostics[0].instance_path, '/');
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test('human and JSON CLI output represent the same ordered failure', async () => {
  const entry = (await loadCorpus()).find((item) => item.case === 'invalid-reference');
  const { temporaryRoot, packRoot } = await materializeCase(entry);
  try {
    const jsonRun = spawnSync(
      process.execPath,
      [cliPath, 'validate', packRoot, '--strict', '--json'],
      { encoding: 'utf8' }
    );
    const humanRun = spawnSync(
      process.execPath,
      [cliPath, 'validate', packRoot, '--strict'],
      { encoding: 'utf8' }
    );

    assert.equal(jsonRun.status, 1, jsonRun.stderr);
    assert.equal(humanRun.status, 1, humanRun.stderr);
    const result = JSON.parse(jsonRun.stdout);
    const humanDiagnostics = humanRun.stdout.split('\n').filter((line) => /^(?:ERROR|WARNING) /.test(line));
    const ordered = [...result.errors, ...result.warnings];
    assert.equal(humanDiagnostics.length, ordered.length);

    for (const [index, item] of ordered.entries()) {
      const line = humanDiagnostics[index];
      assert.ok(line.startsWith(`${item.severity.toUpperCase()} ${item.code} `));
      assert.ok(line.includes(`${item.path}#${item.instance_path}:`));
      assert.ok(line.includes(item.message));
      assert.ok(line.endsWith(`Fix: ${item.guidance}`));
    }
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
});
