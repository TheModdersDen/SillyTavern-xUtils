import { jest } from '@jest/globals';
import { AutoModeOptions } from 'sillytavern-utils-lib/types/translate';
import {
  ensureXUtilsSystemPromptPresetInstalled,
  getCurrentGlobalSystemPromptName,
  getSystemPromptPresetContent,
  hasSystemPromptPreset,
  insertSystemPromptMessage,
  listSystemPromptPresetNames,
  resolveTrackerSystemPromptName,
  shouldWarnAboutSharedSystemPromptSelection,
} from '../system-prompt.js';
import {
  LEGACY_PROMPT_TOON,
  LEGACY_PROMPT_XML,
  XUTILS_SYSTEM_PROMPT_PRESET_NAME,
  XUTILS_SYSTEM_PROMPT_TEXT,
  DEFAULT_PROMPT_TOON,
  PREVIOUS_DEFAULT_PROMPT_TOON,
  DEFAULT_PROMPT_XML,
  PREVIOUS_DEFAULT_PROMPT_XML,
  migrateCorruptedSchemaPresetRequiredMetadata,
  migrateLegacyAutoMode,
  migrateLegacyPromptTemplates,
  migrateLegacyRenamedSettings,
} from '../config.js';

describe('system prompt helpers', () => {
  test('lists preset names from array-based preset list', () => {
    const names = listSystemPromptPresetNames({
      getPresetManager: () => ({
        getPresetList: () => ({
          presets: [],
          preset_names: ['Default', 'xUtils'],
        }),
        getCompletionPresetByName: () => undefined,
      }),
    });

    expect(names).toEqual(['Default', 'xUtils']);
  });

  test('lists preset names from object-based preset list', () => {
    const names = listSystemPromptPresetNames({
      getPresetManager: () => ({
        getPresetList: () => ({
          presets: [],
          preset_names: { Default: 0, xUtils: 1 },
        }),
        getCompletionPresetByName: () => undefined,
      }),
    });

    expect(names).toEqual(['Default', 'xUtils']);
  });

  test('prefers getAllPresets when available', () => {
    const names = listSystemPromptPresetNames({
      getPresetManager: () => ({
        getAllPresets: () => ['Default', 'xUtils'],
        getPresetList: () => ({
          presets: [],
          preset_names: [],
        }),
        getCompletionPresetByName: () => undefined,
      }),
    });

    expect(names).toEqual(['Default', 'xUtils']);
  });

  test('installs shipped xUtils system prompt when missing', async () => {
    const savePreset = jest.fn(async () => undefined);

    const installed = await ensureXUtilsSystemPromptPresetInstalled({
      getPresetManager: () => ({
        getCompletionPresetByName: () => undefined,
        getPresetList: () => ({ presets: [], preset_names: [] }),
        savePreset,
      }),
    });

    expect(installed).toBe(true);
    expect(savePreset).toHaveBeenCalledWith(XUTILS_SYSTEM_PROMPT_PRESET_NAME, {
      name: XUTILS_SYSTEM_PROMPT_PRESET_NAME,
      content: XUTILS_SYSTEM_PROMPT_TEXT,
    });
  });

  test('does not overwrite existing shipped xUtils system prompt', async () => {
    const savePreset = jest.fn(async () => undefined);

    const installed = await ensureXUtilsSystemPromptPresetInstalled({
      getPresetManager: () => ({
        getCompletionPresetByName: () => ({
          name: XUTILS_SYSTEM_PROMPT_PRESET_NAME,
          content: 'customized',
        }),
        getPresetList: () => ({ presets: [], preset_names: [] }),
        savePreset,
      }),
    });

    expect(installed).toBe(false);
    expect(savePreset).not.toHaveBeenCalled();
  });

  test('checks whether a saved preset exists', () => {
    expect(
      hasSystemPromptPreset('xUtils', {
        getPresetManager: () => ({
          getCompletionPresetByName: (name?: string) =>
            name === 'xUtils' ? { name: 'xUtils', content: 'x' } : undefined,
          getPresetList: () => ({ presets: [], preset_names: [] }),
        }),
      }),
    ).toBe(true);

    expect(
      hasSystemPromptPreset('missing', {
        getPresetManager: () => ({
          getCompletionPresetByName: () => undefined,
          getPresetList: () => ({ presets: [], preset_names: [] }),
        }),
      }),
    ).toBe(false);
  });

  test('returns saved preset content when present', () => {
    expect(
      getSystemPromptPresetContent('xUtils', {
        getPresetManager: () => ({
          getCompletionPresetByName: (name?: string) =>
            name === 'xUtils' ? { name: 'xUtils', content: '  extracted prompt  ' } : undefined,
          getPresetList: () => ({ presets: [], preset_names: [] }),
        }),
      }),
    ).toBe('extracted prompt');
  });

  test('reads the current global system prompt name from power user settings', () => {
    expect(
      getCurrentGlobalSystemPromptName({
        getPresetManager: () => ({
          getPresetList: () => ({ presets: [], preset_names: [] }),
        }),
        powerUserSettings: {
          sysprompt: {
            name: '  Neutral - Chat  ',
          },
        },
      }),
    ).toBe('Neutral - Chat');
  });

  test('resolves the active global system prompt in profile mode', () => {
    expect(
      resolveTrackerSystemPromptName(
        {
          trackerSystemPromptMode: 'profile',
          trackerSystemPromptSavedName: 'xUtils',
        },
        {
          getPresetManager: () => ({
            getPresetList: () => ({ presets: [], preset_names: [] }),
          }),
          powerUserSettings: {
            sysprompt: {
              name: 'Active Prompt',
            },
          },
        },
      ),
    ).toBe('Active Prompt');
  });

  test('resolves saved system prompt in saved mode', () => {
    expect(
      resolveTrackerSystemPromptName(
        {
          trackerSystemPromptMode: 'saved',
          trackerSystemPromptSavedName: 'xUtils',
        },
        {
          getPresetManager: () => ({
            getPresetList: () => ({ presets: [], preset_names: [] }),
          }),
          powerUserSettings: {
            sysprompt: {
              name: 'Profile Prompt',
            },
          },
        },
      ),
    ).toBe('xUtils');
  });

  test('warns when tracker saved prompt matches the active global system prompt', () => {
    expect(
      shouldWarnAboutSharedSystemPromptSelection(
        {
          trackerSystemPromptMode: 'saved',
          trackerSystemPromptSavedName: 'xUtils',
        },
        {
          getPresetManager: () => ({
            getPresetList: () => ({ presets: [], preset_names: [] }),
          }),
          powerUserSettings: {
            sysprompt: {
              name: 'XUTILS',
            },
          },
        },
      ),
    ).toBe(true);

    expect(
      shouldWarnAboutSharedSystemPromptSelection(
        {
          trackerSystemPromptMode: 'saved',
          trackerSystemPromptSavedName: 'xUtils',
        },
        {
          getPresetManager: () => ({
            getPresetList: () => ({ presets: [], preset_names: [] }),
          }),
          powerUserSettings: {
            sysprompt: {
              name: 'Neutral - Chat',
            },
          },
        },
      ),
    ).toBe(false);
  });

  test('inserts a saved system prompt after existing leading system messages', () => {
    const result = insertSystemPromptMessage(
      [
        { role: 'system', content: 'existing system' },
        { role: 'user', content: 'hello' },
      ],
      'saved tracker prompt',
    );

    expect(result).toEqual([
      { role: 'system', content: 'existing system' },
      { role: 'system', content: 'saved tracker prompt' },
      { role: 'user', content: 'hello' },
    ]);
  });

  test('migrates legacy XML and TOON prompt templates without touching customized values', () => {
    const legacySettings = {
      promptXml: LEGACY_PROMPT_XML,
      promptToon: LEGACY_PROMPT_TOON,
    };

    expect(migrateLegacyPromptTemplates(legacySettings)).toBe(true);
    expect(legacySettings.promptXml).toBe(DEFAULT_PROMPT_XML);
    expect(legacySettings.promptToon).toBe(DEFAULT_PROMPT_TOON);

    const customizedSettings = {
      promptXml: `${LEGACY_PROMPT_XML}\ncustomized`,
      promptToon: `${LEGACY_PROMPT_TOON}\ncustomized`,
    };

    expect(migrateLegacyPromptTemplates(customizedSettings)).toBe(false);
    expect(customizedSettings.promptXml).toContain('customized');
    expect(customizedSettings.promptToon).toContain('customized');
  });

  test('migrates the previous XML schema-wrapper prompt to the current default', () => {
    const settings = {
      promptXml: PREVIOUS_DEFAULT_PROMPT_XML,
      promptToon: DEFAULT_PROMPT_TOON,
    };

    expect(migrateLegacyPromptTemplates(settings)).toBe(true);
    expect(settings.promptXml).toBe(DEFAULT_PROMPT_XML);
    expect(settings.promptToon).toBe(DEFAULT_PROMPT_TOON);
  });

  test('migrates the previous TOON prompt to the stronger current default', () => {
    const settings = {
      promptXml: DEFAULT_PROMPT_XML,
      promptToon: PREVIOUS_DEFAULT_PROMPT_TOON,
    };

    expect(migrateLegacyPromptTemplates(settings)).toBe(true);
    expect(settings.promptXml).toBe(DEFAULT_PROMPT_XML);
    expect(settings.promptToon).toBe(DEFAULT_PROMPT_TOON);
  });

  test('migrates the legacy input auto-mode value to the canonical enum value', () => {
    const settings = {
      autoMode: 'input',
    } as { autoMode: string };

    expect(migrateLegacyAutoMode(settings as any)).toBe(true);
    expect(settings.autoMode).toBe(AutoModeOptions.INPUT);
    expect(migrateLegacyAutoMode(settings as any)).toBe(false);
  });

  test('migrates renamed zTracker settings keys to xUtils keys', () => {
    const settings = {
      includeLastXZTrackerMessages: 3,
      embedZTrackerRole: 'assistant',
      includeLastXXUtilsMessages: 1,
    } as Record<string, unknown>;

    expect(migrateLegacyRenamedSettings(settings)).toBe(true);
    expect(settings.includeLastXXUtilsMessages).toBe(1);
    expect(settings.embedXUtilsRole).toBe('assistant');
    expect(settings.includeLastXZTrackerMessages).toBeUndefined();
    expect(settings.embedZTrackerRole).toBeUndefined();
  });

  test('repairs corrupted schema presets that stored required arrays under properties.required', () => {
    const settings = {
      schemaPresets: {
        default: {
          name: 'Default',
          value: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              required: ['title'],
            },
            required: [],
          },
          html: '<div></div>',
        },
      },
    } as any;

    expect(migrateCorruptedSchemaPresetRequiredMetadata(settings)).toBe(true);
    expect(settings.schemaPresets.default.value.required).toEqual(['title']);
    expect(settings.schemaPresets.default.value.properties.required).toBeUndefined();
    expect(migrateCorruptedSchemaPresetRequiredMetadata(settings)).toBe(false);
  });

  test('ships a lean TOON prompt that relies on the example instead of verbose syntax prose', () => {
    expect(DEFAULT_PROMPT_TOON).toContain('Return exactly one ```toon code block and nothing else.');
    expect(DEFAULT_PROMPT_TOON).toContain('Keep every array count accurate: each `[N]` must match the number of items or rows.');
    expect(DEFAULT_PROMPT_TOON).toContain('Do not add wrapper keys unless the schema requires them.');
    expect(DEFAULT_PROMPT_TOON).not.toContain('For arrays of scalars, use the `fieldName[count\\t]: item1\\titem2` layout shown in the example.');
  });
});
