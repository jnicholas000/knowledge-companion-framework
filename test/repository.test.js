import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import YAML from 'yaml';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const applicationVocabulary =
  /\b(?:atlas ?notes|isp|lumen|observatory|telescope|safety ?gate|instrument ?mode)\b/;

function containsApplicationVocabulary(source) {
  const normalized = source.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return applicationVocabulary.test(normalized);
}

async function walk(directory, predicate) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['.git', 'node_modules'].includes(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(entryPath, predicate));
    else if (predicate(entryPath)) files.push(entryPath);
  }
  return files;
}

test('repository-local Markdown links resolve', async () => {
  const markdownFiles = await walk(repositoryRoot, (file) => file.endsWith('.md'));
  const missing = [];

  for (const file of markdownFiles) {
    const source = await fs.readFile(file, 'utf8');
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const destination = match[1].trim().replace(/^<|>$/g, '');
      if (/^(?:[a-z]+:|#)/i.test(destination)) continue;
      const withoutAnchor = destination.split('#', 1)[0];
      const target = path.resolve(path.dirname(file), decodeURIComponent(withoutAnchor));
      try {
        await fs.access(target);
      } catch {
        const missingLink = `${path.relative(repositoryRoot, file)} -> ${destination}`;
        missing.push(missingLink);
      }
    }
  }

  assert.deepEqual(missing, []);
});

test('framework implementation, schemas, and templates do not depend on example applications', async () => {
  const coreFiles = [
    ...await walk(path.join(repositoryRoot, 'src'), () => true),
    ...await walk(path.join(repositoryRoot, 'schemas'), () => true),
    ...await walk(path.join(repositoryRoot, 'templates'), () => true)
  ];
  const violations = [];

  for (const file of coreFiles) {
    const source = await fs.readFile(file, 'utf8');
    if (containsApplicationVocabulary(source)) {
      violations.push(path.relative(repositoryRoot, file));
    }
  }

  assert.deepEqual(violations, []);
});

test('application-isolation guard rejects vocabulary across identifier delimiters', () => {
  for (const leak of [
    'const safety_gate = true;',
    'const safetyGate = true;',
    'safety-gate: closed',
    'safety gate status',
    'const instrument_mode = "imaging";',
    'const instrumentMode = "imaging";',
    'instrument-mode: imaging',
    'instrument mode catalog'
  ]) {
    assert.equal(containsApplicationVocabulary(leak), true, `expected leakage: ${leak}`);
  }

  for (const generic of ['safety check', 'instrument adapter', 'mode selector']) {
    assert.equal(containsApplicationVocabulary(generic), false, `unexpected leakage: ${generic}`);
  }
});

test('onboarding template and example expose the complete narrative learning-path profile', async () => {
  const requiredHeadings = [
    '## Learning Outcomes',
    '## Prerequisites',
    '## Progressive Concept Path',
    '## Learner Questions',
    '## Exercises',
    '## Existing-System Code Tour',
    '## Practical Mission Guide',
    '## Verification',
    '## Next Routes'
  ];
  const onboardingPaths = [
    'templates/onboarding.md',
    'examples/atlas-notes/delivery/onboard-contributor.md'
  ];

  for (const relativePath of onboardingPaths) {
    const source = await fs.readFile(path.join(repositoryRoot, relativePath), 'utf8');
    assert.match(source, /^kind: onboarding$/m, `${relativePath} must use the onboarding kind`);
    for (const heading of requiredHeadings) {
      assert.ok(source.includes(heading), `${relativePath} must include ${heading}`);
    }
  }
});

test('GitHub Actions runs the consolidated least-privileged repository gate', async () => {
  const workflow = YAML.parse(
    await fs.readFile(path.join(repositoryRoot, '.github/workflows/validate.yml'), 'utf8')
  );
  const packageJson = JSON.parse(await fs.readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));

  assert.deepEqual(workflow.on.workflow_dispatch, null);
  assert.deepEqual(workflow.on.pull_request, null);
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(Object.keys(workflow.jobs), ['validate']);

  const steps = workflow.jobs.validate.steps;
  assert.equal(steps[0].uses, 'actions/checkout@v7');
  assert.equal(steps[1].uses, 'actions/setup-node@v7');
  assert.equal(steps[1].with['node-version'], 20);
  assert.equal(steps[1].with.cache, 'npm');
  assert.equal(steps[2].run, 'npm ci');
  assert.equal(steps[3].run, 'npm run check:ci');

  assert.equal(packageJson.engines.node, '>=20');
  assert.match(packageJson.scripts['check:ci'], /npm test/);
  assert.match(packageJson.scripts['check:ci'], /npm run validate:schemas/);
  assert.match(packageJson.scripts['check:ci'], /npm run validate/);
  assert.match(packageJson.scripts['check:ci'], /npm run check:syntax/);
  assert.match(packageJson.scripts['check:ci'], /npm audit --audit-level=high/);
  assert.match(packageJson.scripts['check:ci'], /git diff --check/);
});
