import { EXTENSION_KEY, LEGACY_EXTENSION_KEY } from './extension-metadata.js';

type LegacyMigrationResult = {
  settings: boolean;
  chatMetadata: boolean;
  chatMessages: boolean;
};

function moveLegacyExtensionRecord(container: unknown): boolean {
  if (!container || typeof container !== 'object') {
    return false;
  }

  const record = container as Record<string, unknown>;
  const legacyValue = record[LEGACY_EXTENSION_KEY];
  if (!legacyValue || typeof legacyValue !== 'object') {
    return false;
  }

  if (!record[EXTENSION_KEY] || typeof record[EXTENSION_KEY] !== 'object') {
    record[EXTENSION_KEY] = legacyValue;
  }

  delete record[LEGACY_EXTENSION_KEY];
  return true;
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
