import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schemaDirectory = fileURLToPath(new URL('../schemas/v1/', import.meta.url));

export const schemaIds = Object.freeze({
  pack: 'https://knowledge-companion.dev/schemas/v1/pack.schema.json',
  knowledge: 'https://knowledge-companion.dev/schemas/v1/knowledge-entry.schema.json',
  retrieval_requests: 'https://knowledge-companion.dev/schemas/v1/retrieval-request.schema.json',
  retrieval_results: 'https://knowledge-companion.dev/schemas/v1/retrieval-result.schema.json',
  impacts: 'https://knowledge-companion.dev/schemas/v1/knowledge-impact.schema.json',
  candidates: 'https://knowledge-companion.dev/schemas/v1/learning-candidate.schema.json',
  estimates: 'https://knowledge-companion.dev/schemas/v1/estimate.schema.json',
  evaluation_cases: 'https://knowledge-companion.dev/schemas/v1/evaluation-case.schema.json',
  evaluation_results: 'https://knowledge-companion.dev/schemas/v1/evaluation-result.schema.json',
  reasoning_responses: 'https://knowledge-companion.dev/schemas/v1/reasoning-response.schema.json'
});

export async function loadSchemaCatalog() {
  const filenames = (await fs.readdir(schemaDirectory))
    .filter((filename) => filename.endsWith('.schema.json'))
    .sort();

  return Promise.all(
    filenames.map(async (filename) => {
      const source = await fs.readFile(path.join(schemaDirectory, filename), 'utf8');
      return { filename, schema: JSON.parse(source) };
    })
  );
}

export async function createSchemaValidator() {
  const catalog = await loadSchemaCatalog();
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  for (const { schema } of catalog) {
    ajv.addSchema(schema);
  }

  for (const { schema } of catalog) {
    ajv.getSchema(schema.$id);
  }

  return { ajv, catalog };
}
