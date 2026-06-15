export type LooseRecord = Record<string, unknown>;

export function asRecord(value: unknown): LooseRecord {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid payload: expected object.");
  }

  return value as LooseRecord;
}

export function toTrimmedString(
  value: unknown,
  label: string,
  options: { maxLength: number; allowEmpty?: boolean }
): string {
  if (typeof value !== "string") {
    throw new Error(`Invalid ${label}: expected string.`);
  }

  const trimmed = value.trim();
  if (!options.allowEmpty && trimmed.length === 0) {
    throw new Error(`Invalid ${label}: empty value.`);
  }

  if (trimmed.length > options.maxLength) {
    throw new Error(`Invalid ${label}: too long.`);
  }

  return trimmed;
}

export function toOptionalTrimmedString(
  value: unknown,
  label: string,
  options: { maxLength: number; allowEmpty?: boolean } = { maxLength: 2048 }
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return toTrimmedString(value, label, options);
}

export function toPositiveInt(
  value: unknown,
  label: string,
  options: { min: number; max: number }
): number {
  if (!Number.isInteger(value) || typeof value !== "number") {
    throw new Error(`Invalid ${label}: expected integer.`);
  }

  if (value < options.min || value > options.max) {
    throw new Error(`Invalid ${label}: out of range.`);
  }

  return value;
}

export function toOptionalPositiveInt(
  value: unknown,
  label: string,
  options: { min: number; max: number }
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return toPositiveInt(value, label, options);
}

export function toStringArray(
  value: unknown,
  label: string,
  options: { maxItems: number; maxLength: number; allowEmpty?: boolean }
): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected array.`);
  }

  if (value.length > options.maxItems) {
    throw new Error(`Invalid ${label}: too many entries.`);
  }

  const out: string[] = [];
  for (const rawItem of value) {
    const item = toTrimmedString(rawItem, label, {
      maxLength: options.maxLength,
      allowEmpty: options.allowEmpty
    });
    if (!item) {
      continue;
    }
    if (!out.includes(item)) {
      out.push(item);
    }
  }

  return out;
}

export function toOptionalStringArray(
  value: unknown,
  label: string,
  options: { maxItems: number; maxLength: number; allowEmpty?: boolean }
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  return toStringArray(value, label, options);
}

export function toStringMap(
  value: unknown,
  label: string,
  options: { maxEntries: number; maxKeyLength: number; maxValueLength: number }
): Record<string, string> {
  const record = asRecord(value);
  const entries = Object.entries(record);

  if (entries.length > options.maxEntries) {
    throw new Error(`Invalid ${label}: too many entries.`);
  }

  const out = Object.create(null) as Record<string, string>;
  for (const [rawKey, rawValue] of entries) {
    const key = toTrimmedString(rawKey, `${label} key`, {
      maxLength: options.maxKeyLength
    });
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      throw new Error(`Invalid ${label}: reserved key.`);
    }
    const itemValue = toTrimmedString(rawValue, `${label} value`, {
      maxLength: options.maxValueLength,
      allowEmpty: true
    });
    out[key] = itemValue;
  }

  return out;
}

export function toOptionalStringMap(
  value: unknown,
  label: string,
  options: { maxEntries: number; maxKeyLength: number; maxValueLength: number }
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return toStringMap(value, label, options);
}
