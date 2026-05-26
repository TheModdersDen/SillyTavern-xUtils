import { jest } from '@jest/globals';
import { formatMessagesForXai, isXaiApiServer } from '../xaiMessageFormatter.js';

describe('xAI message formatter', () => {
  test('detects xAI API hosts', () => {
    expect(isXaiApiServer('https://api.x.ai/v1')).toBe(true);
    expect(isXaiApiServer('api.x.ai/v1')).toBe(true);
    expect(isXaiApiServer('https://notx.ai.example/v1')).toBe(false);
    expect(isXaiApiServer('https://example.com/v1')).toBe(false);
  });

  test('strips unsupported SillyTavern message fields while preserving valid chat-completions fields', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(
      formatMessagesForXai([
        { role: 'system', content: 'System prompt', name: 'ignored' },
        { role: 'assistant', content: 'Reply', ignoreInstruct: true },
      ]),
    ).toEqual([
      { role: 'system', content: 'System prompt' },
      { role: 'assistant', content: 'Reply' },
    ]);

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('validates tool-call message shape before request submission', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      formatMessagesForXai([
        {
          role: 'tool',
          content: '{"status":"ok"}',
        },
      ]),
    ).toThrow('xAI message formatting failed: messages[0].tool_call_id is required for tool messages.');

    errorSpy.mockRestore();
  });
});
