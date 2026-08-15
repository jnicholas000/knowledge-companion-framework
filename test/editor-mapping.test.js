import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import fg from 'fast-glob';
import YAML from 'yaml';

import { createSchemaValidator, schemaIds } from '../src/schema-catalog.js';
import { validatePack } from '../src/validator.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const workspacePath = path.join(repositoryRoot, 'knowledge-companion-framework.code-workspace');

test('the removable workspace maps structured YAML to canonical schemas', async () => {
  let workspaceSource;
  try {
    workspaceSource = await fs.readFile(workspacePath, 'utf8');
  } catch (error) {
    assert.equal(error.code, 'ENOENT');
    assert.equal(process.env.KCF_STANDALONE_CHILD, '1');
    return;
  }

  const workspace = JSON.parse(workspaceSource);
  const mappings = workspace.settings?.['yaml.schemas'];
  assert.equal(workspace.extensions.recommendations.includes('redhat.vscode-yaml'), true);
  assert.deepEqual(mappings['./schemas/v1/pack.schema.json'], [
    '/examples/*/pack.yaml',
    '/templates/pack.yaml'
  ]);
  assert.deepEqual(mappings['./schemas/v1/evaluation-case.schema.json'], [
    '/examples/*/evals/**/*.case.yaml',
    '/templates/evaluation-case.yaml'
  ]);

  for (const schemaPath of Object.keys(mappings)) {
    await fs.access(path.resolve(repositoryRoot, schemaPath));
  }

  const recordMappings = [
    {
      schema: './schemas/v1/retrieval-request.schema.json',
      group: 'retrieval_requests',
      direct: 'examples/sample/evals/example.retrieval-request.yaml',
      nested: 'examples/sample/evals/regression/example.retrieval-request.yaml'
    },
    {
      schema: './schemas/v1/retrieval-result.schema.json',
      group: 'retrieval_results',
      direct: 'examples/sample/evals/example.retrieval-result.yaml',
      nested: 'examples/sample/evals/regression/example.retrieval-result.yaml'
    },
    {
      schema: './schemas/v1/knowledge-impact.schema.json',
      group: 'impacts',
      direct: 'examples/sample/learning/impacts/example.yaml',
      nested: 'examples/sample/learning/impacts/regression/example.yaml'
    },
    {
      schema: './schemas/v1/learning-candidate.schema.json',
      group: 'candidates',
      direct: 'examples/sample/learning/candidates/example.yaml',
      nested: 'examples/sample/learning/candidates/regression/example.yaml'
    },
    {
      schema: './schemas/v1/estimate.schema.json',
      group: 'estimates',
      direct: 'examples/sample/estimates/example.yaml',
      nested: 'examples/sample/estimates/regression/example.yaml'
    },
    {
      schema: './schemas/v1/evaluation-case.schema.json',
      group: 'evaluation_cases',
      direct: 'examples/sample/evals/example.case.yaml',
      nested: 'examples/sample/evals/regression/example.case.yaml'
    },
    {
      schema: './schemas/v1/evaluation-result.schema.json',
      group: 'evaluation_results',
      direct: 'examples/sample/evals/example.result.yaml',
      nested: 'examples/sample/evals/regression/example.result.yaml'
    },
    {
      schema: './schemas/v1/reasoning-response.schema.json',
      group: 'reasoning_responses',
      direct: 'examples/sample/evals/example.reasoning.yaml',
      nested: 'examples/sample/evals/regression/example.reasoning.yaml'
    }
  ];
  const templateManifest = YAML.parse(
    await fs.readFile(path.join(repositoryRoot, 'templates', 'pack.yaml'), 'utf8')
  );
  for (const { schema, group } of recordMappings) {
    const patterns = [mappings[schema]].flat();
    assert.equal(
      patterns.includes(`/examples/*/${templateManifest.content[group][0]}`),
      true,
      `${schema} must mirror the canonical ${group} discovery glob`
    );
  }

  const mappingRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'kcf-editor-mapping-'));
  try {
    for (const { direct, nested } of recordMappings) {
      await fs.mkdir(path.join(mappingRoot, path.dirname(direct)), { recursive: true });
      await fs.mkdir(path.join(mappingRoot, path.dirname(nested)), { recursive: true });
      await fs.writeFile(path.join(mappingRoot, direct), 'fixture: direct\n');
      await fs.writeFile(path.join(mappingRoot, nested), 'fixture: nested\n');
    }

    for (const { schema, direct, nested } of recordMappings) {
      const patterns = [mappings[schema]].flat().map((pattern) => pattern.replace(/^\//, ''));
      const matched = await fg(patterns, { cwd: mappingRoot, onlyFiles: true });
      assert.equal(matched.includes(direct), true, `${schema} must match ${direct}`);
      assert.equal(matched.includes(nested), true, `${schema} must match ${nested}`);
    }
  } finally {
    await fs.rm(mappingRoot, { recursive: true, force: true });
  }

  const lumenManifest = await fs.readFile(
    path.join(repositoryRoot, 'examples', 'lumen-observatory', 'pack.yaml'),
    'utf8'
  );
  const invalidManifest = YAML.parse(lumenManifest.replace('name: Lumen Observatory Example Pack\n', ''));
  const { ajv } = await createSchemaValidator();
  const validate = ajv.getSchema(schemaIds.pack);
  assert.equal(validate(invalidManifest), false);
  assert.equal(
    validate.errors.some((error) => error.keyword === 'required' && error.params.missingProperty === 'name'),
    true
  );
});

test('CLI correctness has no dependency on the removable editor mapping', async () => {
  const standaloneSource = await fs.readFile(
    path.join(repositoryRoot, 'scripts', 'check-standalone.mjs'),
    'utf8'
  );
  assert.match(standaloneSource, /'knowledge-companion-framework\.code-workspace'/);

  const [atlas, lumen] = await Promise.all([
    validatePack(path.join(repositoryRoot, 'examples', 'atlas-notes'), { strict: true }),
    validatePack(path.join(repositoryRoot, 'examples', 'lumen-observatory'), { strict: true })
  ]);
  assert.equal(atlas.valid, true, JSON.stringify(atlas.errors, null, 2));
  assert.equal(lumen.valid, true, JSON.stringify(lumen.errors, null, 2));
});
