import fs from 'node:fs/promises';
import path from 'node:path';

import picomatch from 'picomatch';
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

// The validator enumerates regular non-hidden files without following links.
// Propagate read errors so an unreadable subtree cannot validate as empty.
export async function discoverRegularFiles(root) {
  const files = [];
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) files.push(absolutePath);
    }
  }
  await visit(root);
  return files.sort();
}

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
    const matches = matchContentPaths(uniquePaths, manifest.content[group] ?? []).sort();
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

// Preserve ordered include/exclude/re-include behavior without the vulnerable
// braces expansion dependency. Picomatch is the matcher micromatch delegates to.
// Matching-set logic adapted from micromatch (MIT):
// Copyright (c) 2014-present, Jon Schlinkert.
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
function matchContentPaths(paths, patterns) {
  const omitted = new Set();
  const included = new Set();
  const visited = new Set();
  let negativeCount = 0;
  for (const pattern of patterns) {
    // Picomatch's default range compiler uses a character class, which is not
    // equivalent to numeric brace expansion (for example, {1..10}). Compile
    // bounded ranges explicitly; reject excessive/unsupported ranges rather
    // than silently omitting declared records or restoring vulnerable braces.
    let rangeValues = 0;
    const expandRange = (...parts) => {
      parts.pop(); // Picomatch supplies its options after the range endpoints.
      const [first, last, stride = '1'] = parts;
      const numeric = /^-?\d+$/.test(first) && /^-?\d+$/.test(last);
      const letters = /^[A-Za-z]$/.test(first) && /^[A-Za-z]$/.test(last);
      if (parts.length < 2 || parts.length > 3 || (!numeric && !letters)
        || !/^-?\d+$/.test(stride)) throw new Error(`Unsupported content glob range: ${pattern}`);
      const start = numeric ? Number(first) : first.charCodeAt(0);
      const end = numeric ? Number(last) : last.charCodeAt(0);
      const step = Math.max(1, Math.abs(Number(stride)));
      const count = Math.floor(Math.abs(end - start) / step) + 1;
      rangeValues += count;
      if (![start, end, step, count].every(Number.isSafeInteger) || rangeValues > 1000) {
        throw new Error(`Content glob range exceeds the 1000-value safe limit: ${pattern}`);
      }
      const endpoints = [first, last];
      const width = numeric && endpoints.some((value) => /^-?0\d/.test(value))
        ? Math.max(...endpoints.map((value) => value.length)) : 0;
      const values = Array.from({ length: count }, (_, index) => {
        const value = start + (start > end ? -1 : 1) * step * index;
        if (!numeric) return String.fromCharCode(value).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
        const sign = value < 0 ? '-' : '';
        return sign + String(Math.abs(value)).padStart(Math.max(0, width - sign.length), '0');
      });
      return `(?:${values.join('|')})`;
    };
    const matcher = picomatch(pattern, { dot: false, expandRange }, true);
    const negative = matcher.state.negated || matcher.state.negatedExtglob;
    if (negative) negativeCount += 1;
    for (const filePath of paths) {
      const result = matcher(filePath, true);
      visited.add(result.output);
      if (!(negative ? !result.isMatch : result.isMatch)) continue;
      if (negative) omitted.add(result.output);
      else {
        omitted.delete(result.output);
        included.add(result.output);
      }
    }
  }
  const matches = negativeCount === patterns.length ? visited : included;
  return [...matches].filter((filePath) => !omitted.has(filePath));
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
