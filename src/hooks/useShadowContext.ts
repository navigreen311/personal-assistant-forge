'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageRole = 'user' | 'shadow' | 'system';
export type ContentType = 'TEXT' | 'ACTION_CARD' | 'NAVIGATION_CARD' | 'DECISION_CARD' | 'CONFIRM_CARD';

export interface ShadowMessage {
  id: string;
  role: MessageRole;
  content: string;
  contentType: ContentType;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface ShadowSession {
  id: string;
  entityId?: string;
  entityName?: string;
  startedAt: Date;
  status: 'active' | 'paused' | 'ended';
}

export interface ShadowContextState {
  messages: ShadowMessage[];
  session: ShadowSession | null;
  isConnected: boolean;
  isProcessing: boolean;
  pendingCount: number;
}

export interface ShadowContextActions {
  sendMessage: (text: string) => Promise<void>;
  sendActionResponse: (actionId: string, response: string) => Promise<void>;
  startSession: (entityId?: string) => Promise<void>;
  endSession: () => Promise<void>;
  clearMessages: () => void;
}

export type ShadowContext = ShadowContextState & ShadowContextActions;

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useShadowContext(): ShadowContext {
  const [messages, setMessages] = useState<ShadowMessage[]>([]);
  const [session, setSession] = useState<ShadowSession | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPanelOpenRef = useRef(false);

  // --------------------------------------------------
  // Polling for new messages (every 2s when panel open)
  // --------------------------------------------------
  const pollMessages = useCallback(async () => {
    if (!session?.id) return;
    try {
      const res = await fetch(`/api/shadow/session/${session.id}/messages?after=${messages.length}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const newMessages: ShadowMessage[] = json.data.map((m: Record<string, unknown>) => ({
          ...m,
          timestamp: new Date(m.timestamp as string),
        }));
        setMessages((prev) => [...prev, ...newMessages]);
      }
      if (typeof json.pendingCount === 'number') {
        setPendingCount(json.pendingCount);
      }
    } catch {
      // Silently fail on poll
    }
  }, [session?.id, messages.length]);

  const startPolling = useCallback(() => {
    isPanelOpenRef.current = true;
    if (pollingRef.current) return;
    pollingRef.current = setInterval(() => {
      if (isPanelOpenRef.current) {
        pollMessages();
      }
    }, 2000);
  }, [pollMessages]);

  const stopPolling = useCallback(() => {
    isPanelOpenRef.current = false;
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // Auto-start/stop polling based on session
  useEffect(() => {
    if (session?.status === 'active') {
      setIsConnected(true);
      startPolling();
    } else {
      setIsConnected(false);
      stopPolling();
    }
  }, [session?.status, startPolling, stopPolling]);

  // --------------------------------------------------
  // Send a user message
  // --------------------------------------------------
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const userMessage: ShadowMessage = {
        id: generateId(),
        role: 'user',
        content: text.trim(),
        contentType: 'TEXT',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsProcessing(true);

      try {
        const res = await fetch('/api/shadow/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session?.id,
            message: text.trim(),
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to send message');
        }

        const json = await res.json();

        if (json.success && json.data) {
          // Update sessionId if one was created server-side
          if (json.data.sessionId && !session?.id) {
            setSession({
              id: json.data.sessionId,
              startedAt: new Date(),
              status: 'active',
            });
          }

          const shadowMessage: ShadowMessage = {
            id: json.data.messageId || json.data.id || generateId(),
            role: 'shadow',
            content: json.data.response?.text || json.data.content || '',
            contentType: (json.data.response?.contentType?.toUpperCase() || json.data.contentType || 'TEXT') as ContentType,
            timestamp: new Date(json.data.timestamp || Date.now()),
            metadata: json.data.response ?? json.data.metadata,
          };
          setMessages((prev) => [...prev, shadowMessage]);

          if (typeof json.pendingCount === 'number') {
            setPendingCount(json.pendingCount);
          }
        }
      } catch {
        const errorMessage: ShadowMessage = {
          id: generateId(),
          role: 'system',
          content: 'Failed to get a response. Please try again.',
          contentType: 'TEXT',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsProcessing(false);
      }
    },
    [session?.id],
  );

  // --------------------------------------------------
  // Send an action card response
  // --------------------------------------------------
  const sendActionResponse = useCallback(
    async (actionId: string, response: string) => {
      try {
        const res = await fetch('/api/shadow/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: session?.id,
            actionId,
            response,
          }),
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            const confirmMessage: ShadowMessage = {
              id: json.data.id || generateId(),
              role: 'shadow',
              content: json.data.content || `Action "${response}" confirmed.`,
              contentType: json.data.contentType || 'TEXT',
              timestamp: new Date(),
              metadata: json.data.metadata,
            };
            setMessages((prev) => [...prev, confirmMessage]);
          }
          if (typeof json.pendingCount === 'number') {
            setPendingCount(json.pendingCount);
          }
        }
      } catch {
        // Silently fail, the action card will show as responded
      }
    },
    [session?.id],
  );

  // --------------------------------------------------
  // Start a session
  // --------------------------------------------------
  const startSession = useCallback(async (entityId?: string) => {
    try {
      const res = await fetch('/api/shadow/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId, channel: 'web' }),
      });

      if (!res.ok) {
        throw new Error('Failed to start session');
      }

      const json = await res.json();
      if (json.success && json.data) {
        setSession({
          id: json.data.id,
          entityId: json.data.entityId ?? json.data.activeEntityId,
          entityName: json.data.entityName,
          startedAt: new Date(json.data.startedAt || Date.now()),
          status: json.data.status === 'active' ? 'active' : 'active',
        });
        setPendingCount(0);

        // Add welcome message
        const welcomeMsg: ShadowMessage = {
          id: generateId(),
          role: 'shadow',
          content: json.data.welcomeMessage || 'Hey! Shadow here. How can I help you today?',
          contentType: 'TEXT',
          timestamp: new Date(),
        };
        setMessages([welcomeMsg]);
      }
    } catch {
      const errMsg: ShadowMessage = {
        id: generateId(),
        role: 'system',
        content: 'Failed to start session. Please try again.',
        contentType: 'TEXT',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  }, []);

  // --------------------------------------------------
  // End a session
  // --------------------------------------------------
  const endSession = useCallback(async () => {
    if (!session?.id) return;

    try {
      await fetch(`/api/shadow/session/${session.id}/end`, {
        method: 'POST',
      });
    } catch {
      // Best-effort end
    }

    setSession(null);
    setIsConnected(false);
    setPendingCount(0);
    stopPolling();
  }, [session?.id, stopPolling]);

  // --------------------------------------------------
  // Clear messages (local only)
  // --------------------------------------------------
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    session,
    isConnected,
    isProcessing,
    pendingCount,
    sendMessage,
    sendActionResponse,
    startSession,
    endSession,
    clearMessages,
  };
}
