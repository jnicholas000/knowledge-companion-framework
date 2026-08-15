import {
  InterchangeError,
  canonicalJson,
  compareUtf8,
  requireNonEmptyString,
  sha256,
  validatePortablePath
} from './interchange.js';

const changeTypes = new Set(['added', 'modified', 'deleted', 'renamed']);

function normalizeLimitations(limitations) {
  if (!Array.isArray(limitations)) {
    throw new InterchangeError('change_set.malformed', 'limitations must be an array');
  }
  const normalized = limitations.map((item) =>
    requireNonEmptyString(item, 'change_set.malformed', 'limitation')
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new InterchangeError('change_set.malformed', 'limitations must be unique');
  }
  return normalized.sort(compareUtf8);
}

function normalizeContentIdentity(contentIdentity) {
  if (contentIdentity === undefined) return undefined;
  if (contentIdentity === null || typeof contentIdentity !== 'object' || Array.isArray(contentIdentity)) {
    throw new InterchangeError('change.content_identity_invalid', 'content_identity must be an object');
  }
  const algorithm = requireNonEmptyString(
    contentIdentity.algorithm,
    'change.content_identity_invalid',
    'content_identity.algorithm'
  );
  const value = requireNonEmptyString(
    contentIdentity.value,
    'change.content_identity_invalid',
    'content_identity.value'
  );
  return { algorithm, value };
}

function normalizeChange(change) {
  if (change === null || typeof change !== 'object' || Array.isArray(change)) {
    throw new InterchangeError('change.malformed', 'each change must be an object');
  }
  const path = validatePortablePath(change.path, 'change.path');
  const changeType = requireNonEmptyString(change.change_type, 'change.type_invalid', 'change_type');
  if (!changeTypes.has(changeType)) {
    throw new InterchangeError('change.type_invalid', `unsupported change type ${changeType}`);
  }

  const normalized = { path, change_type: changeType };
  if (changeType === 'renamed') {
    const oldPath = validatePortablePath(change.old_path, 'change.old_path');
    if (oldPath === path) {
      throw new InterchangeError('change.rename_ambiguous', 'a rename must use distinct old and new paths');
    }
    normalized.old_path = oldPath;
  } else if (change.old_path !== undefined) {
    throw new InterchangeError('change.rename_ambiguous', 'old_path is allowed only for renamed changes');
  }

  const contentIdentity = normalizeContentIdentity(change.content_identity);
  if (contentIdentity !== undefined) normalized.content_identity = contentIdentity;
  return normalized;
}

function compareChanges(left, right) {
  const pathOrder = compareUtf8(left.path, right.path);
  if (pathOrder !== 0) return pathOrder;
  return compareUtf8(left.old_path ?? '', right.old_path ?? '');
}

function normalizeObservedAt(value) {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/
  );
  if (!match) {
    throw new InterchangeError('change_set.observed_at_invalid', 'observed_at must be an RFC 3339 timestamp');
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const offsetHour = zone === 'Z' ? 0 : Number(offsetHourText);
  const offsetMinute = zone === 'Z' ? 0 : Number(offsetMinuteText);
  if (
    month < 1
    || month > 12
    || day < 1
    || day > daysInMonth[month - 1]
    || hour > 23
    || minute > 59
    || second > 59
    || offsetHour > 23
    || offsetMinute > 59
  ) {
    throw new InterchangeError(
      'change_set.observed_at_invalid',
      'observed_at must contain a real RFC 3339 calendar timestamp'
    );
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new InterchangeError('change_set.observed_at_invalid', 'observed_at must be an RFC 3339 timestamp');
  }
  return new Date(timestamp).toISOString();
}

export function normalizeChangeSet(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InterchangeError('change_set.malformed', 'change set must be an object');
  }
  const repositoryId = requireNonEmptyString(
    input.repository_id,
    'change_set.repository_missing',
    'repository_id'
  );
  const baseRevision = requireNonEmptyString(
    input.base_revision,
    'change_set.revision_missing',
    'base_revision'
  );
  const targetRevision = requireNonEmptyString(
    input.target_revision,
    'change_set.revision_missing',
    'target_revision'
  );
  const observedAt = requireNonEmptyString(
    input.observed_at,
    'change_set.observed_at_invalid',
    'observed_at'
  );
  const normalizedObservedAt = normalizeObservedAt(observedAt);
  if (!['complete', 'partial'].includes(input.completeness)) {
    throw new InterchangeError('change_set.completeness_invalid', 'completeness must be complete or partial');
  }
  if (!Array.isArray(input.changes)) {
    throw new InterchangeError('change_set.malformed', 'changes must be an array');
  }

  const limitations = normalizeLimitations(input.limitations ?? []);
  if (input.completeness === 'partial' && limitations.length === 0) {
    throw new InterchangeError('change_set.partial_without_limitation', 'partial change sets need a limitation');
  }
  const changes = input.changes.map(normalizeChange).sort(compareChanges);
  const occupiedPaths = new Map();
  for (const change of changes) {
    for (const candidate of [change.path, change.old_path].filter(Boolean)) {
      const prior = occupiedPaths.get(candidate);
      if (prior) {
        throw new InterchangeError(
          'change.path_conflict',
          `path ${candidate} occurs in both ${prior} and ${change.change_type} changes`
        );
      }
      occupiedPaths.set(candidate, change.change_type);
    }
  }

  return {
    representation_version: '1.0',
    repository_id: repositoryId,
    base_revision: baseRevision,
    target_revision: targetRevision,
    observed_at: normalizedObservedAt,
    completeness: input.completeness,
    changes,
    limitations
  };
}

export function canonicalizeChangeSet(changeSet) {
  return canonicalJson(normalizeChangeSet(changeSet));
}

export function identifyChangeSet(changeSet) {
  return `sha256:${sha256(canonicalizeChangeSet(changeSet))}`;
}

function parseGitNameStatus(raw) {
  if (typeof raw !== 'string') {
    throw new InterchangeError('change_set.malformed', 'Git name-status output must be a string');
  }
  if (raw === '') return [];
  if (!raw.endsWith('\0')) {
    throw new InterchangeError('change_set.malformed', 'Git name-status output must be NUL terminated');
  }

  const tokens = raw.slice(0, -1).split('\0');
  const changes = [];
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    const kind = status[0];
    if (kind === 'R') {
      if (index + 1 >= tokens.length) {
        throw new InterchangeError('change_set.malformed', 'Git rename entry is incomplete');
      }
      const oldPath = tokens[index++];
      const newPath = tokens[index++];
      changes.push({ path: newPath, old_path: oldPath, change_type: 'renamed' });
      continue;
    }
    const mapping = { A: 'added', M: 'modified', D: 'deleted' };
    if (!mapping[kind] || index >= tokens.length) {
      throw new InterchangeError('change.type_invalid', `unsupported Git status ${status}`);
    }
    changes.push({ path: tokens[index++], change_type: mapping[kind] });
  }
  return changes;
}

export function normalizeGitChangeSet(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InterchangeError('change_set.malformed', 'Git adapter input must be an object');
  }
  return normalizeChangeSet({
    repository_id: input.repository_id,
    base_revision: input.base_revision,
    target_revision: input.target_revision,
    observed_at: input.observed_at,
    completeness: input.completeness ?? 'complete',
    limitations: input.limitations ?? [],
    changes: parseGitNameStatus(input.name_status_z)
  });
}

export function normalizeSyntheticProviderChangeSet(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new InterchangeError('change_set.malformed', 'synthetic provider fixture must be an object');
  }
  if (!Array.isArray(input.files)) {
    throw new InterchangeError('change_set.malformed', 'synthetic provider files must be an array');
  }
  if (
    input.page === null
    || typeof input.page !== 'object'
    || Array.isArray(input.page)
    || typeof input.page.complete !== 'boolean'
    || !Array.isArray(input.page.limitations)
  ) {
    throw new InterchangeError('change_set.malformed', 'synthetic provider page metadata is malformed');
  }
  const mapping = { created: 'added', updated: 'modified', removed: 'deleted', moved: 'renamed' };
  const changes = input.files.map((file) => {
    if (file === null || typeof file !== 'object' || Array.isArray(file)) {
      throw new InterchangeError('change.malformed', 'synthetic provider file must be an object');
    }
    const changeType = mapping[file.action];
    if (!changeType) {
      throw new InterchangeError('change.type_invalid', `unsupported synthetic action ${file.action}`);
    }
    if (changeType !== 'renamed' && file.previous_path !== undefined) {
      throw new InterchangeError('change.rename_ambiguous', 'previous_path is allowed only for moved files');
    }
    return {
      path: file.current_path,
      change_type: changeType,
      ...(changeType === 'renamed' ? { old_path: file.previous_path } : {})
    };
  });

  return normalizeChangeSet({
    repository_id: input.repository?.identity,
    base_revision: input.revisions?.from,
    target_revision: input.revisions?.to,
    observed_at: input.collected_at,
    completeness: input.page.complete ? 'complete' : 'partial',
    limitations: input.page.limitations,
    changes
  });
}
