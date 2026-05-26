import { migrateLegacyExtensionStorage } from '../legacy-migration.js';

describe('legacy storage migration', () => {
  test('does not drop legacy data when destination extension key is not a plain object', () => {
    const context = {
      extensionSettings: {
        zTracker: { value: 1 },
        xUtils: [],
      },
    } as any;

    const result = migrateLegacyExtensionStorage(context);
    expect(result.settings).toBe(false);
    expect(context.extensionSettings.zTracker).toEqual({ value: 1 });
  });

  test('moves legacy object record to extension key when destination is missing', () => {
    const context = {
      extensionSettings: {
        zTracker: { value: 1 },
      },
    } as any;

    const result = migrateLegacyExtensionStorage(context);
    expect(result.settings).toBe(true);
    expect(context.extensionSettings.xUtils).toEqual({ value: 1 });
    expect(context.extensionSettings.zTracker).toBeUndefined();
  });
});
