'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ShadowMessage } from '@/hooks/useShadowContext';
import { ShadowActionCard } from './ShadowActionCard';
import { ShadowNavigationCard } from './ShadowNavigationCard';
import { ShadowDecisionCard } from './ShadowDecisionCard';
import { ShadowConfirmCard } from './ShadowConfirmCard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShadowPanelProps {
  messages: ShadowMessage[];
  isProcessing: boolean;
  entityName?: string;
  isVoiceActive: boolean;
  onSendMessage: (text: string) => void;
  onSendActionResponse: (actionId: string, response: string) => void;
  onClose: () => void;
  onMinimize: () => void;
  onToggleVoice: () => void;
}

// ---------------------------------------------------------------------------
// Typing indicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <div className="flex gap-1">
        <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">Shadow is thinking...</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message renderer
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  onActionResponse,
}: {
  message: ShadowMessage;
  onActionResponse: (actionId: string, response: string) => void;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const metadata = message.metadata as Record<string, unknown> | undefined;

  // Render special content types
  if (message.contentType === 'ACTION_CARD' && metadata) {
    return (
      <div className="flex justify-start mb-3">
        <ShadowActionCard
          id={(metadata.actionId as string) || message.id}
          title={(metadata.title as string) || 'Action Required'}
          description={message.content}
          options={
            (metadata.options as Array<{ label: string; action: string; style: 'primary' | 'secondary' | 'danger' }>) || []
          }
          onResponse={onActionResponse}
        />
      </div>
    );
  }

  if (message.contentType === 'NAVIGATION_CARD' && metadata) {
    return (
      <div className="flex justify-start mb-3">
        <ShadowNavigationCard
          title={(metadata.title as string) || 'Navigate'}
          description={message.content}
          deepLink={(metadata.deepLink as string) || '/'}
          recordType={(metadata.recordType as 'invoice' | 'task' | 'calendar' | 'contact' | 'document' | 'workflow' | 'project' | 'default') || 'default'}
          recordId={metadata.recordId as string | undefined}
        />
      </div>
    );
  }

  if (message.contentType === 'DECISION_CARD' && metadata) {
    return (
      <div className="flex justify-start mb-3">
        <ShadowDecisionCard
          question={message.content}
          options={
            (metadata.options as Array<{ id: string; label: string; description?: string }>) || []
          }
          onSelect={(optionId: string) => {
            onActionResponse(message.id, optionId);
          }}
          selected={metadata.selected as string | undefined}
        />
      </div>
    );
  }

  if (message.contentType === 'CONFIRM_CARD' && metadata) {
    return (
      <div className="flex justify-start mb-3">
        <ShadowConfirmCard
          message={message.content}
          canUndo={(metadata.canUndo as boolean) || false}
          undoDeadlineSeconds={(metadata.undoDeadlineSeconds as number) || 10}
          onUndo={() => {
            onActionResponse(message.id, 'undo');
          }}
          receiptId={metadata.receiptId as string | undefined}
        />
      </div>
    );
  }

  // Default text bubble
  return (
    <div className={`flex mb-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-md'
            : isSystem
              ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-bl-md'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md'
        }`}
      >
        {message.content}
        <div
          className={`text-[10px] mt-1 ${
            isUser
              ? 'text-indigo-200'
              : isSystem
                ? 'text-amber-400 dark:text-amber-500'
                : 'text-gray-400 dark:text-gray-500'
          }`}
        >
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ShadowPanel
// ---------------------------------------------------------------------------

export function ShadowPanel({
  messages,
  isProcessing,
  entityName,
  isVoiceActive,
  onSendMessage,
  onSendActionResponse,
  onClose,
  onMinimize,
  onToggleVoice,
}: ShadowPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isProcessing]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isProcessing) return;
    onSendMessage(inputValue.trim());
    setInputValue('');
  }, [inputValue, isProcessing, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="fixed right-6 bottom-24 z-50 w-[420px] max-h-[600px] flex flex-col rounded-2xl shadow-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden max-sm:inset-0 max-sm:w-full max-sm:max-h-full max-sm:rounded-none max-sm:bottom-0 max-sm:right-0">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-800 dark:to-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 dark:text-white text-sm">Shadow</span>
          {entityName && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-medium">
              {entityName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Voice toggle */}
          <button
            onClick={onToggleVoice}
            className={`p-1.5 rounded-md transition-colors ${
              isVoiceActive
                ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400'
                : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600'
            }`}
            aria-label={isVoiceActive ? 'Disable voice' : 'Enable voice'}
            title={isVoiceActive ? 'Voice active' : 'Enable voice'}
          >
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {isVoiceActive ? (
                <>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <path d="M12 19v4" />
                  <path d="M8 23h8" />
                </>
              ) : (
                <>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </>
              )}
            </svg>
          </button>

          {/* Minimize */}
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 transition-colors"
            aria-label="Minimize panel"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M5 12h14" />
            </svg>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-red-500 transition-colors"
            aria-label="Close panel"
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* ---- Message list ---- */}
      <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <svg
              width={40}
              height={40}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-gray-300 dark:text-gray-600 mb-3"
            >
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <circle cx="12" cy="5" r="2" />
              <path d="M12 7v4" />
              <circle cx="8" cy="16" r="1" />
              <circle cx="16" cy="16" r="1" />
            </svg>
            <p className="text-sm text-gray-400 dark:text-gray-500">
              Start a conversation with Shadow
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onActionResponse={onSendActionResponse}
          />
        ))}

        {isProcessing && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* ---- Footer / Input ---- */}
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 px-4 py-3 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Shadow anything..."
            className="flex-1 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
            disabled={isProcessing}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isProcessing}
            className="p-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
            aria-label="Send message"
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>

          {/* Mic button */}
          <button
            onClick={onToggleVoice}
            className={`p-2 rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
              isVoiceActive
                ? 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500 animate-pulse'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 focus:ring-gray-400'
            }`}
            aria-label={isVoiceActive ? 'Stop recording' : 'Start recording'}
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <path d="M12 19v4" />
              <path d="M8 23h8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
