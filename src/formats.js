import fs from 'node:fs/promises';

import micromatch from 'micromatch';
import { parseDocument } from 'yaml';

export const contentGroups = Object.freeze([
  'knowledge',
  'retrieval_requests',
  'retrieval_results',
  'impacts',
  'candidates',
  'estimates',
  'evaluation_cases',
  'evaluation_results',
  'reasoning_responses'
]);

function parseYaml(source, filePath) {
  const document = parseDocument(source, {
    maxAliasCount: 50,
    prettyErrors: true,
    uniqueKeys: true
  });

  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join('; '));
  }

  if (document.warnings.length > 0) {
    throw new Error(document.warnings.map((warning) => warning.message).join('; '));
  }

  const value = document.toJS({ maxAliasCount: 50 });
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${filePath} must contain one object`);
  }
  return value;
}

export function discoverContentGroups(manifest, paths) {
  const uniquePaths = [...new Set(paths)].sort();
  const discovered = new Map();
  const ownerByPath = new Map();
  const overlaps = [];

  for (const group of contentGroups) {
    const matches = micromatch(uniquePaths, manifest.content[group] ?? [], { dot: false }).sort();
    discovered.set(group, matches);
    for (const filePath of matches) {
      const priorOwner = ownerByPath.get(filePath);
      if (priorOwner && priorOwner !== group) {
        overlaps.push({ path: filePath, priorOwner, group });
      }
      ownerByPath.set(filePath, group);
    }
  }

  return { discovered, overlaps };
}

export function parseStructuredSource(source, filePath) {
  if (filePath.endsWith('.json')) {
    const value = JSON.parse(source);
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`${filePath} must contain one object`);
    }
    return value;
  }
  return parseYaml(source, filePath);
}

export async function loadStructuredFile(filePath) {
  const source = await fs.readFile(filePath, 'utf8');
  return parseStructuredSource(source, filePath);
}

export function parseKnowledgeSource(source, filePath) {
  const lines = source.replaceAll('\r\n', '\n').split('\n');

  if (lines[0] !== '---') {
    throw new Error('Markdown knowledge must begin with a YAML front-matter delimiter (`---`)');
  }

  const closingIndex = lines.indexOf('---', 1);
  if (closingIndex < 0) {
    throw new Error('Markdown knowledge is missing its closing front-matter delimiter (`---`)');
  }

  const frontMatter = parseYaml(lines.slice(1, closingIndex).join('\n'), filePath);
  const body = lines.slice(closingIndex + 1).join('\n').trim();
  return { data: frontMatter, body };
}

export async function loadKnowledgeFile(filePath) {
  const source = await fs.readFile(filePath, 'utf8');
  return parseKnowledgeSource(source, filePath);
}
