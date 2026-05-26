export type XaiMessageRole = 'system' | 'user' | 'assistant' | 'tool';

export type XaiToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export type XaiMessage = {
  role: XaiMessageRole;
  content: string | null;
  tool_calls?: XaiToolCall[];
  tool_call_id?: string;
};

type FormatterOptions = {
  apiServer?: string;
  requestLabel?: string;
};

const XAI_HOST_PATTERN = /(^|\.)x\.ai$/i;
const allowedRoles = new Set<XaiMessageRole>(['system', 'user', 'assistant', 'tool']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeArguments(argumentsValue: unknown, issues: string[], label: string): string {
  if (typeof argumentsValue === 'string') {
    try {
      JSON.parse(argumentsValue);
      return argumentsValue;
    } catch {
      issues.push(`${label}.function.arguments must be a valid JSON string.`);
      return argumentsValue;
    }
  }

  if (argumentsValue === undefined) {
    issues.push(`${label}.function.arguments is required.`);
    return '';
  }

  try {
    return JSON.stringify(argumentsValue);
  } catch {
    issues.push(`${label}.function.arguments could not be serialized to JSON.`);
    return '';
  }
}

function normalizeToolCalls(value: unknown, issues: string[], messageLabel: string): XaiToolCall[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    issues.push(`${messageLabel}.tool_calls must be an array when provided.`);
    return undefined;
  }

  return value.map((toolCall, index) => {
    const label = `${messageLabel}.tool_calls[${index}]`;
    const toolCallObject = isPlainObject(toolCall) ? toolCall : {};
    const functionObject = isPlainObject(toolCallObject.function) ? toolCallObject.function : {};
    const id = typeof toolCallObject.id === 'string' && toolCallObject.id.trim() ? toolCallObject.id.trim() : '';
    const name =
      typeof functionObject.name === 'string' && functionObject.name.trim() ? functionObject.name.trim() : '';

    if (!id) {
      issues.push(`${label}.id is required.`);
    }
    if ((toolCallObject.type ?? 'function') !== 'function') {
      issues.push(`${label}.type must be "function".`);
    }
    if (!name) {
      issues.push(`${label}.function.name is required.`);
    }

    return {
      id,
      type: 'function',
      function: {
        name,
        arguments: normalizeArguments(functionObject.arguments, issues, label),
      },
    };
  });
}

function normalizeContent(
  role: XaiMessageRole,
  content: unknown,
  hasToolCalls: boolean,
  issues: string[],
  messageLabel: string,
): string | null {
  if (content === null) {
    if (role === 'assistant' && hasToolCalls) {
      return null;
    }
    issues.push(`${messageLabel}.content must be a string.`);
    return null;
  }

  if (typeof content === 'string') {
    return content;
  }

  if (content === undefined && role === 'assistant' && hasToolCalls) {
    return null;
  }

  issues.push(`${messageLabel}.content must be a string${role === 'assistant' && hasToolCalls ? ' or null' : ''}.`);
  return null;
}

export function isXaiApiServer(apiServer?: string): boolean {
  if (!apiServer) {
    return false;
  }

  const parseHostname = (value: string): string | null => {
    try {
      return new URL(value).hostname;
    } catch {
      try {
        return new URL(`https://${value.replace(/^\/\//, '')}`).hostname;
      } catch {
        return null;
      }
    }
  };

  const hostname = parseHostname(apiServer);
  return hostname ? XAI_HOST_PATTERN.test(hostname) : false;
}

export function formatMessagesForXai(messages: unknown[], options: FormatterOptions = {}): XaiMessage[] {
  const issues: string[] = [];
  const droppedFields: Array<{ messageIndex: number; fields: string[] }> = [];

  const formattedMessages = messages.map((message, index) => {
    const messageLabel = `messages[${index}]`;
    const messageObject = isPlainObject(message) ? message : {};
    const role = messageObject.role;

    if (!allowedRoles.has(role as XaiMessageRole)) {
      issues.push(`${messageLabel}.role must be one of system, user, assistant, or tool.`);
    }

    const normalizedRole = role as XaiMessageRole;
    const toolCalls = normalizeToolCalls(messageObject.tool_calls, issues, messageLabel);
    const normalizedContent = normalizeContent(
      normalizedRole,
      messageObject.content,
      !!toolCalls?.length,
      issues,
      messageLabel,
    );
    const toolCallId =
      typeof messageObject.tool_call_id === 'string' && messageObject.tool_call_id.trim()
        ? messageObject.tool_call_id.trim()
        : undefined;

    if (normalizedRole === 'tool' && !toolCallId) {
      issues.push(`${messageLabel}.tool_call_id is required for tool messages.`);
    }
    if (normalizedRole !== 'tool' && toolCallId) {
      issues.push(`${messageLabel}.tool_call_id is only valid on tool messages.`);
    }
    if (normalizedRole !== 'assistant' && toolCalls) {
      issues.push(`${messageLabel}.tool_calls are only valid on assistant messages.`);
    }

    const unsupportedFields = Object.keys(messageObject).filter(
      (key) => !['role', 'content', 'tool_calls', 'tool_call_id'].includes(key),
    );
    if (unsupportedFields.length > 0) {
      droppedFields.push({ messageIndex: index, fields: unsupportedFields });
    }

    return {
      role: normalizedRole,
      content: normalizedContent,
      ...(toolCalls?.length ? { tool_calls: toolCalls } : {}),
      ...(toolCallId ? { tool_call_id: toolCallId } : {}),
    } satisfies XaiMessage;
  });

  if (droppedFields.length > 0) {
    console.warn('xUtils: stripped unsupported fields from xAI chat-completions messages.', {
      apiServer: options.apiServer,
      requestLabel: options.requestLabel,
      droppedFields,
    });
  }

  if (issues.length > 0) {
    console.error('xUtils: xAI chat-completions payload validation failed before request.', {
      apiServer: options.apiServer,
      requestLabel: options.requestLabel,
      issues,
      messages,
      formattedMessages,
    });
    throw new Error(`xAI message formatting failed: ${issues.join(' ')}`);
  }

  return formattedMessages;
}
