#!/usr/bin/env node

import { validatePack, validateSchemas } from './validator.js';
import { formatDiagnostic } from './diagnostics.js';
import { CurrentImplementationError, writeCurrentImplementation } from './current-implementation.js';

const usage = `Knowledge Companion Framework reference validator

Usage:
  knowledge-companion validate [pack-path] [--strict] [--json]
  knowledge-companion current-implementation <pack-path> --output <file> [--as-of YYYY-MM-DD]
  knowledge-companion schemas [--json]
  knowledge-companion --help

Options:
  --strict  Treat freshness and quality warnings as errors where supported
  --json    With validate or schemas, emit stable JSON for tool integrations
  --output  Write the derived view to a file outside the application pack
  --as-of   Evaluate freshness at the end of this UTC calendar date
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

  if (command === 'current-implementation') {
    const args = argv.slice(1);
    const outputIndex = args.indexOf('--output');
    const asOfIndex = args.indexOf('--as-of');
    const optionValue = (index, option) => {
      if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) {
        throw new Error(`${option} requires a value.`);
      }
      return args[index + 1];
    };

    try {
      if (args.filter((argument) => argument === '--output').length !== 1) {
        throw new Error('Provide exactly one --output path.');
      }
      if (args.filter((argument) => argument === '--as-of').length > 1) {
        throw new Error('Provide --as-of at most once.');
      }
      const supportedOptions = new Set(['--output', '--as-of']);
      const unknownOption = args.find((argument) => argument.startsWith('--') && !supportedOptions.has(argument));
      if (unknownOption) throw new Error(`Unknown option: ${unknownOption}`);
      const optionValueIndexes = new Set([
        ...(outputIndex >= 0 ? [outputIndex + 1] : []),
        ...(asOfIndex >= 0 ? [asOfIndex + 1] : [])
      ]);
      const packPaths = args.filter((argument, index) => (
        !argument.startsWith('--') && !optionValueIndexes.has(index)
      ));
      if (packPaths.length !== 1) throw new Error('Provide exactly one application pack path.');
      const [packPath] = packPaths;
      const asOf = asOfIndex >= 0 ? optionValue(asOfIndex, '--as-of') : null;
      let now;
      if (asOf !== null) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('--as-of must be a UTC date in YYYY-MM-DD form.');
        now = new Date(`${asOf}T23:59:59.999Z`);
        if (Number.isNaN(now.getTime()) || now.toISOString().slice(0, 10) !== asOf) {
          throw new Error('--as-of must be a valid calendar date.');
        }
      }
      const result = await writeCurrentImplementation(packPath ?? '.', {
        outputPath: optionValue(outputIndex, '--output'),
        ...(now ? { now } : {})
      });
      console.log(
        `Wrote ${result.pack.id}@${result.pack.version} current-implementation view to ${result.outputPath} `
        + `(${result.acceptedRecordCount} accepted record(s), ${result.pendingRecordCount} pending re-verification).`
      );
    } catch (error) {
      if (error instanceof CurrentImplementationError && error.validation) {
        printDiagnostics(error.validation);
      } else {
        console.error(`Current Implementation failed: ${error.message}`);
      }
      process.exitCode = 1;
    }
    return;
  }

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
