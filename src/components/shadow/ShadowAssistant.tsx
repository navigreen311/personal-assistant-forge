'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useShadowContext } from '@/hooks/useShadowContext';
import { ShadowBubble } from './ShadowBubble';
import { ShadowPanel } from './ShadowPanel';

// ---------------------------------------------------------------------------
// ShadowAssistant - Global wrapper, mounts at layout level
// ---------------------------------------------------------------------------

export function ShadowAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const pathname = usePathname();
  const isOnSettingsPage = pathname === '/shadow';

  const {
    messages,
    session,
    isProcessing,
    pendingCount,
    sendMessage,
    sendActionResponse,
    startSession,
    endSession,
  } = useShadowContext();

  // --------------------------------------------------
  // Keyboard shortcut: Ctrl+Shift+S
  // --------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        setIsOpen((prev) => {
          if (!prev) {
            setIsMinimized(false);
          }
          return !prev;
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // --------------------------------------------------
  // Handlers
  // --------------------------------------------------

  const handleBubbleClick = useCallback(() => {
    if (isMinimized) {
      setIsMinimized(false);
      setIsOpen(true);
    } else {
      setIsOpen((prev) => !prev);
    }
  }, [isMinimized]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(false);
  }, []);

  const handleMinimize = useCallback(() => {
    setIsMinimized(true);
    setIsOpen(false);
  }, []);

  const handleToggleVoice = useCallback(() => {
    setIsVoiceActive((prev) => !prev);
  }, []);

  const handleSendMessage = useCallback(
    async (text: string) => {
      // Auto-start session if none exists
      if (!session) {
        await startSession();
      }
      await sendMessage(text);
    },
    [session, startSession, sendMessage],
  );

  const handleSendActionResponse = useCallback(
    async (actionId: string, response: string) => {
      await sendActionResponse(actionId, response);
    },
    [sendActionResponse],
  );

  // --------------------------------------------------
  // Determine states
  // --------------------------------------------------

  const isSessionActive = session?.status === 'active';
  const isSidekick = false; // Sidekick mode managed at a higher level if needed
  const showPanel = isOpen && !isMinimized;

  return (
    <>
      {/* Floating bubble - always visible */}
      <ShadowBubble
        onClick={handleBubbleClick}
        isExpanded={showPanel}
        pendingCount={pendingCount}
        isSidekick={isSidekick}
        isSessionActive={isSessionActive}
        isOnSettingsPage={isOnSettingsPage}
      />

      {/* Chat panel */}
      {showPanel && (
        <ShadowPanel
          messages={messages}
          isProcessing={isProcessing}
          entityName={session?.entityName}
          isVoiceActive={isVoiceActive}
          onSendMessage={handleSendMessage}
          onSendActionResponse={handleSendActionResponse}
          onClose={handleClose}
          onMinimize={handleMinimize}
          onToggleVoice={handleToggleVoice}
        />
      )}
    </>
  );
}
