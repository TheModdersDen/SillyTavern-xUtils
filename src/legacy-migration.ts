import { EXTENSION_KEY, LEGACY_EXTENSION_KEY } from './extension-metadata.js';

type LegacyMigrationResult = {
  settings: boolean;
  chatMetadata: boolean;
  chatMessages: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function moveLegacyExtensionRecord(container: unknown): boolean {
  if (!isPlainObject(container)) {
    return false;
  }

  const record = container;
  const legacyValue = record[LEGACY_EXTENSION_KEY];
  if (!isPlainObject(legacyValue)) {
    return false;
  }

  if (record[EXTENSION_KEY] === undefined) {
    record[EXTENSION_KEY] = legacyValue;
    delete record[LEGACY_EXTENSION_KEY];
    return true;
  }

  if (isPlainObject(record[EXTENSION_KEY])) {
    delete record[LEGACY_EXTENSION_KEY];
    return true;
  }

  return false;
}

export function migrateLegacyExtensionStorage(context: unknown): LegacyMigrationResult {
  const result: LegacyMigrationResult = {
    settings: false,
    chatMetadata: false,
    chatMessages: false,
  };

  if (!context || typeof context !== 'object') {
    return result;
  }

  const typedContext = context as {
    extensionSettings?: unknown;
    chatMetadata?: unknown;
    chat?: Array<{ extra?: unknown }>;
  };

  result.settings = moveLegacyExtensionRecord(typedContext.extensionSettings);
  result.chatMetadata = moveLegacyExtensionRecord(typedContext.chatMetadata);

  for (const message of typedContext.chat ?? []) {
    if (moveLegacyExtensionRecord(message?.extra)) {
      result.chatMessages = true;
    }
  }

  return result;
}
