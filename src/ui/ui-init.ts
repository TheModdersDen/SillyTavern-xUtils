import type { ExtensionSettings } from '../config.js';
import { EXTENSION_KEY } from '../config.js';
import { AutoModeOptions } from 'sillytavern-utils-lib/types/translate';
import type { ChatMessage } from 'sillytavern-utils-lib/types';
import { EventNames } from 'sillytavern-utils-lib/types';
import type { ExtensionSettingsManager } from 'sillytavern-utils-lib';
import type { TrackerActions } from './tracker-actions.js';
import { includeXUtilsMessages } from '../tracker.js';
import { selected_group, st_echo } from 'sillytavern-utils-lib/config';
import {
  getCurrentCharacterId,
  shouldAutoGenerateForCharacterMessage,
  shouldAutoGenerateForUserMessage,
} from './character-auto-mode-exclusion.js';
import { createCharacterPanelButtonController } from './character-panel-auto-mode.js';
import { installXUtilsThemeObserver } from './menu-theme.js';
import { clearMessageStatusIndicator, RENDER_ERROR_STATUS_CLASS, syncMessageStatusIndicator } from './message-status-indicator.js';
import { createOutgoingAutoModeController } from './outgoing-auto-mode.js';
import { installPartsMenuPortalHandlers } from './parts-menu-portal.js';
import { migrateLegacyExtensionStorage } from '../legacy-migration.js';

const incomingTypes = [AutoModeOptions.RESPONSES, AutoModeOptions.BOTH];
const outgoingTypes = [AutoModeOptions.INPUT, AutoModeOptions.BOTH];

type InitializeGlobalUIOptions = {
  globalContext: any;
  settingsManager: ExtensionSettingsManager<ExtensionSettings>;
  actions: TrackerActions;
  renderTrackerWithDeps: (messageId: number) => void;
};

type GenerateInterceptorContext = {
  mainApi?: string;
  selected_group?: string | false;
  name2?: string;
  characterId?: unknown;
  characters?: Array<{
    avatar?: string;
    data?: Record<string, unknown> & {
      extensions?: Record<string, unknown>;
    };
    name?: string;
  }>;
};

let themeObserverInstalled = false;
let characterPanelObserverInstalled = false;
let trackerActionClickHandlerInstalled = false;

const registeredHostEventSources = new WeakSet<object>();

let activeTrackerActionHandler: {
  actions: TrackerActions;
  getPortaledPartsMessageId: (target: HTMLElement) => number | null;
} | null = null;

function normalizeSpeakerLabel(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

// Prefers the host-owned solo-chat speaker label over local history inference.
function resolveAssistantReplyLabel(context: GenerateInterceptorContext): string | undefined {
  const contextLabel = normalizeSpeakerLabel(context.name2);
  if (contextLabel) {
    return contextLabel;
  }

  const characterId = getCurrentCharacterId(context);
  if (characterId === undefined || !Array.isArray(context.characters)) {
    return undefined;
  }

  return normalizeSpeakerLabel(context.characters[characterId]?.name);
}

/** Injects the xUtils per-message action button into SillyTavern's message template. */
function ensureMessageTemplateButton(): void {
  if (document.querySelector('#message_template .mes_buttons .extraMesButtons .mes_xutils_button')) {
    return;
  }

  const xUtilsIcon = document.createElement('div');
  xUtilsIcon.title = 'xUtils';
  xUtilsIcon.className = 'mes_button mes_xutils_button fa-solid fa-truck-moving interactable';
  xUtilsIcon.tabIndex = 0;
  document.querySelector('#message_template .mes_buttons .extraMesButtons')?.prepend(xUtilsIcon);
}

/** Resolves the message id for a click target from either a message row or the active portaled parts menu. */
function resolveMessageIdFromTarget(
  target: HTMLElement,
  getPortaledPartsMessageId: (target: HTMLElement) => number | null,
): number | null {
  const messageElement = target.closest('.mes');
  if (messageElement) {
    const parsedMessageId = Number(messageElement.getAttribute('mesid'));
    return Number.isNaN(parsedMessageId) ? null : parsedMessageId;
  }

  return getPortaledPartsMessageId(target);
}

/** Applies tracker-specific click actions for message buttons and parts-menu controls. */
function installTrackerActionClickHandler(): void {
  if (trackerActionClickHandlerInstalled) {
    return;
  }

  document.addEventListener('click', (event) => {
    const runtime = activeTrackerActionHandler;
    if (!runtime) {
      return;
    }

    const target = event.target as HTMLElement;
    const messageId = resolveMessageIdFromTarget(target, runtime.getPortaledPartsMessageId);
    if (messageId === null) {
      return;
    }

    const { actions } = runtime;

    const fieldButton = target.closest('.xutils-array-item-field-regenerate-button') as HTMLElement | null;
    if (fieldButton) {
      const partKey = fieldButton.getAttribute('data-xutils-part') ?? '';
      const index = Number(fieldButton.getAttribute('data-xutils-index') ?? '');
      const name = fieldButton.getAttribute('data-xutils-name') ?? '';
      const idKey = fieldButton.getAttribute('data-xutils-idkey') ?? '';
      const idValue = fieldButton.getAttribute('data-xutils-idvalue') ?? '';
      const fieldKey = fieldButton.getAttribute('data-xutils-field') ?? '';

      if (partKey && fieldKey && idKey && idValue && 'generateTrackerArrayItemFieldByIdentity' in actions) {
        // @ts-ignore - optional capability depending on build/version.
        actions.generateTrackerArrayItemFieldByIdentity(messageId, partKey, idKey, idValue, fieldKey);
      } else if (partKey && fieldKey && name && 'generateTrackerArrayItemFieldByName' in actions) {
        // @ts-ignore - optional capability depending on build/version.
        actions.generateTrackerArrayItemFieldByName(messageId, partKey, name, fieldKey);
      } else if (partKey && fieldKey && !Number.isNaN(index) && 'generateTrackerArrayItemField' in actions) {
        // @ts-ignore - optional capability depending on build/version.
        actions.generateTrackerArrayItemField(messageId, partKey, index, fieldKey);
      }

      return;
    }

    const itemButton = target.closest('.xutils-array-item-regenerate-button') as HTMLElement | null;
    if (itemButton) {
      const partKey = itemButton.getAttribute('data-xutils-part') ?? '';
      const index = Number(itemButton.getAttribute('data-xutils-index') ?? '');
      const name = itemButton.getAttribute('data-xutils-name') ?? '';
      const idKey = itemButton.getAttribute('data-xutils-idkey') ?? '';
      const idValue = itemButton.getAttribute('data-xutils-idvalue') ?? '';

      if (partKey && idKey && idValue && 'generateTrackerArrayItemByIdentity' in actions) {
        // @ts-ignore - optional capability depending on build/version.
        actions.generateTrackerArrayItemByIdentity(messageId, partKey, idKey, idValue);
      } else if (partKey && name) {
        actions.generateTrackerArrayItemByName(messageId, partKey, name);
      } else if (partKey && !Number.isNaN(index)) {
        actions.generateTrackerArrayItem(messageId, partKey, index);
      }
      return;
    }

    const partButton = target.closest('.xutils-part-regenerate-button') as HTMLElement | null;
    if (partButton) {
      const partKey = partButton.getAttribute('data-xutils-part') ?? '';
      if (partKey) {
        actions.generateTrackerPart(messageId, partKey);
      }
      return;
    }

    if (target.classList.contains('mes_xutils_button')) {
      actions.generateTracker(messageId, { showStatusIndicator: true });
    } else if (target.classList.contains('xutils-cleanup-button') && 'openTrackerCleanup' in actions) {
      // @ts-ignore - optional capability depending on build/version.
      actions.openTrackerCleanup(messageId);
    } else if (target.classList.contains('xutils-edit-button')) {
      actions.editTracker(messageId);
    } else if (target.classList.contains('xutils-regenerate-button')) {
      actions.generateTracker(messageId, { showStatusIndicator: true });
    } else if (target.classList.contains('xutils-delete-button')) {
      actions.deleteTracker(messageId);
    }
  });

  trackerActionClickHandlerInstalled = true;
}

/** Rerenders persisted trackers for the active chat and strips any data that no longer matches the template. */
function rerenderTrackersForCurrentChat(options: {
  globalContext: any;
  renderTrackerWithDeps: (messageId: number) => void;
}): void {
  const { globalContext, renderTrackerWithDeps } = options;
  let hadRenderError = false;
  clearMessageStatusIndicator({ statusClassName: RENDER_ERROR_STATUS_CLASS });

  globalContext.chat.forEach((_message: any, messageId: number) => {
    try {
      renderTrackerWithDeps(messageId);
    } catch (error) {
      hadRenderError = true;
      console.error(`Error rendering xUtils on message ${messageId}, keeping stored data:`, error);
      syncMessageStatusIndicator({
        messageId,
        text: 'xUtils failed to render. Stored data was kept.',
        statusClassName: RENDER_ERROR_STATUS_CLASS,
        iconClassName: 'xutils-message-status-icon xutils-message-status-icon--static fa-solid fa-triangle-exclamation',
      });
    }
  });

  if (hadRenderError) {
    st_echo('error', 'A xUtils template failed to render for one or more messages. Tracker data was kept.');
  }
}

/** Boots xUtils's document-level UI helpers and wires them to SillyTavern runtime events. */
export async function initializeGlobalUI(options: InitializeGlobalUIOptions) {
  const { globalContext, settingsManager, actions, renderTrackerWithDeps } = options;
  const partsMenuPortal = installPartsMenuPortalHandlers();
  const characterPanelButtons = createCharacterPanelButtonController({ settingsManager });
  const outgoingAutoMode = createOutgoingAutoModeController({ actions });

  if ('setBeforeRequestStartHook' in actions && typeof actions.setBeforeRequestStartHook === 'function') {
    actions.setBeforeRequestStartHook(() => {
      outgoingAutoMode.noteTrackerRequestStart();
    });
  }

  if (!themeObserverInstalled) {
    installXUtilsThemeObserver();
    themeObserverInstalled = true;
  }

  characterPanelButtons.scheduleSync();
  if (!characterPanelObserverInstalled) {
    characterPanelButtons.installDomObserver();
    characterPanelObserverInstalled = true;
  }

  outgoingAutoMode.installDocumentHandlers();

  ensureMessageTemplateButton();
  activeTrackerActionHandler = {
    actions,
    getPortaledPartsMessageId: partsMenuPortal.getMessageIdForTarget,
  };
  installTrackerActionClickHandler();

  await actions.renderExtensionTemplates();
  outgoingAutoMode.syncUi();

  const eventSource = globalContext?.eventSource;
  if (eventSource && !registeredHostEventSources.has(eventSource as object)) {
    globalContext.eventSource.on(
      EventNames.CHARACTER_MESSAGE_RENDERED,
      (messageId: number) => {
        const settings = settingsManager.getSettings();
        if (!incomingTypes.includes(settings.autoMode)) return;

        const context = SillyTavern.getContext();
        if (!shouldAutoGenerateForCharacterMessage({ chat: context.chat, characters: context.characters }, messageId)) {
          return;
        }

        actions.generateTracker(messageId, { silent: true, showStatusIndicator: false });
      },
    );
    globalContext.eventSource.on(EventNames.USER_MESSAGE_RENDERED, (messageId: number) => {
      outgoingAutoMode.handleUserMessageRendered(messageId);
    });
    globalContext.eventSource.on(
      EventNames.MESSAGE_SENT,
      (messageId: number) => {
        const settings = settingsManager.getSettings();
        if (!outgoingTypes.includes(settings.autoMode)) return;

        const context = SillyTavern.getContext();
        if (!shouldAutoGenerateForUserMessage({ characterId: (context as any).characterId, characters: context.characters })) {
          return;
        }

        const runId = outgoingAutoMode.beginPendingMessage(messageId);
        outgoingAutoMode.tryStopPendingHostGeneration();

        void (async () => {
          try {
            await actions.generateTracker(messageId, { silent: true, showStatusIndicator: false });
          } catch (error) {
            console.error('xUtils auto mode failed to generate a tracker before reply.', error);
          }

          const completion = outgoingAutoMode.finishPendingMessage(messageId, runId);
          if (!completion.finished) {
            return;
          }

          if (!completion.shouldResumeHostGeneration) {
            return;
          }

          await outgoingAutoMode.resumeHostGeneration();
        })();
      },
    );

    globalContext.eventSource.on(EventNames.GENERATION_STARTED, () => {
      outgoingAutoMode.handleGenerationStarted();
    });

    globalContext.eventSource.on(EventNames.CHAT_CHANGED, () => {
      const migration = migrateLegacyExtensionStorage(SillyTavern.getContext());
      if (migration.chatMetadata && typeof globalContext.saveMetadataDebounced === 'function') {
        globalContext.saveMetadataDebounced();
      }
      if (migration.chatMessages && typeof globalContext.saveChat === 'function') {
        void globalContext.saveChat();
      }

      outgoingAutoMode.resetAndSync({ invalidateRun: true });
      characterPanelButtons.scheduleSync();
      rerenderTrackersForCurrentChat({ globalContext, renderTrackerWithDeps });
    });

    registeredHostEventSources.add(eventSource as object);
  }

  const generateInterceptor = (chat: ChatMessage[]) => {
    const textCompletionSafeContext = SillyTavern.getContext() as GenerateInterceptorContext;
    const isGroupChat = Boolean(textCompletionSafeContext?.selected_group ?? selected_group);
    const newChat = includeXUtilsMessages(chat, settingsManager.getSettings(), {
      preserveTextCompletionTurnAlternation: textCompletionSafeContext?.mainApi === 'textgenerationwebui',
      isGroupChat,
      assistantReplyLabel: isGroupChat ? undefined : resolveAssistantReplyLabel(textCompletionSafeContext),
    });
    chat.length = 0;
    chat.push(...newChat);
  };

  (globalThis as any).xutilsGenerateInterceptor = generateInterceptor;
  (globalThis as any).ztrackerGenerateInterceptor = generateInterceptor;
}
