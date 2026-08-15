#!/usr/bin/env node

import { validatePack, validateSchemas } from './validator.js';
import { formatDiagnostic } from './diagnostics.js';

const usage = `Knowledge Companion Framework reference validator

Usage:
  knowledge-companion validate [pack-path] [--strict] [--json]
  knowledge-companion schemas [--json]
  knowledge-companion --help

Options:
  --strict  Treat freshness and quality warnings as errors where supported
  --json    Emit a stable JSON result for tool integrations
`;

function printDiagnostics(result) {
  const identity = result.pack ? `${result.pack.id}@${result.pack.version}` : 'pack';
  console.log(`${result.valid ? 'VALID' : 'INVALID'} ${identity} (${result.files_checked} files checked)`);
  for (const item of [...result.errors, ...result.warnings]) {
    console.log(formatDiagnostic(item));
  }
  console.log(`${result.errors.length} error(s), ${result.warnings.length} warning(s)`);
}

async function main(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(usage);
    return;
  }

  const json = argv.includes('--json');
  const positional = argv.filter((argument) => !argument.startsWith('--'));
  const command = positional[0];

  if (command === 'schemas') {
    const result = await validateSchemas();
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`VALID ${result.schema_count} schemas`);
      for (const schema of result.schemas) console.log(`${schema.filename}: ${schema.id}`);
    }
    return;
  }

  if (command === 'validate') {
    const packPath = positional[1] ?? '.';
    const result = await validatePack(packPath, { strict: argv.includes('--strict') });
    if (json) console.log(JSON.stringify(result, null, 2));
    else printDiagnostics(result);
    if (!result.valid) process.exitCode = 1;
    return;
  }

  console.error(`Unknown command: ${command}\n\n${usage}`);
  process.exitCode = 2;
}

main(process.argv.slice(2)).catch((error) => {
  console.error(`Validator failed: ${error.stack ?? error.message}`);
  process.exitCode = 2;
});
