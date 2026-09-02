const guidanceByCode = Object.freeze({
  'parse.invalid': 'Fix the YAML, JSON, or Markdown front matter syntax, then rerun validation.',
  'schema.invalid': 'Add or correct the value at this location so it satisfies the canonical JSON Schema.',
  'reference.knowledge_missing': 'Use an existing discovered knowledge record ID, or add the intended record to the manifest content globs.',
  'reference.evidence_missing': 'Reference an evidence ID supplied by the record, or add the missing evidence item.',
  'reference.source_missing': 'Use a source_id declared in pack.yaml sources, or declare the source there.',
  'extension.kind_undeclared': 'Use a core kind, or declare this x-... kind under extensions.knowledge_kinds in pack.yaml.',
  'extension.relationship_undeclared': 'Use a core relationship type, or declare this x-... type under extensions.relationship_types in pack.yaml.',
  'evidence.path_missing': 'Correct the locator relative to its declared local source root and ensure the file exists.',
  'evidence.path_unsafe': 'Use a relative locator that stays inside the declared local source root.',
  'path.invalid': 'Use an NFC-normalized forward-slash relative path or glob with no empty, dot, parent, or trailing-slash segment; use directory/** to match directory contents.',
  'freshness.review_due': 'Re-verify the knowledge against its evidence before updating review_after; do not advance the date without review.',
  'snapshot.pack_mismatch': 'Use the validated pack ID and keep the snapshot identity within one pack.',
  'snapshot.version_mismatch': 'Use the validated pack version for this snapshot.',
  'pack.manifest_missing': 'Add pack.yaml, pack.yml, or pack.json at the pack root.',
  'pack.path_invalid': 'Pass the path of an existing pack directory.',
  'source.root_invalid': 'Set the local source root to an existing directory inside the pack root.'
});

export function escapeJsonPointerSegment(value) {
  return String(value).replaceAll('~', '~0').replaceAll('/', '~1');
}

export function appendJsonPointer(pointer, segment) {
  const base = pointer && pointer !== '/' ? pointer : '';
  return `${base}/${escapeJsonPointerSegment(segment)}`;
}

export function createDiagnostic(severity, code, filePath, message, instancePath = '/', guidance) {
  return {
    severity,
    code,
    path: filePath,
    instance_path: instancePath || '/',
    message: String(message).replace(/\s+/g, ' ').trim(),
    guidance: String(
      guidance ?? guidanceByCode[code] ?? 'Correct the indicated value and rerun validation.'
    ).replace(/\s+/g, ' ').trim()
  };
}

export function formatDiagnostic(item) {
  return `${item.severity.toUpperCase()} ${item.code} ${item.path}#${item.instance_path}: ${item.message} Fix: ${item.guidance}`;
}
