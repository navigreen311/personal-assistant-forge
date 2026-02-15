'use client';

import { useSession, signOut as nextAuthSignOut } from 'next-auth/react';
import type { AuthSession } from './types';

export function useAuthSession(): {
  user: AuthSession | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  activeEntityId: string | null;
  switchEntity: (entityId: string) => Promise<void>;
  signOut: () => Promise<void>;
} {
  const { data: session, status, update } = useSession();

  const user: AuthSession | null = session?.user
    ? {
        userId: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
        activeEntityId: session.user.activeEntityId,
      }
    : null;

  const switchEntity = async (entityId: string) => {
    const res = await fetch('/api/auth/switch-entity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityId }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error?.message ?? 'Failed to switch entity');
    }

    // Refresh the session to pick up the new activeEntityId
    await update();
  };

  const signOut = async () => {
    await nextAuthSignOut({ callbackUrl: '/login' });
  };

  return {
    user,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    activeEntityId: user?.activeEntityId ?? null,
    switchEntity,
    signOut,
  };
}
