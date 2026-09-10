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

    // P-29: this line used to be a lie. The endpoint returned the value it was
    // given and wrote nothing, so `update()` re-read the same cookie and
    // re-issued the same activeEntityId. The endpoint now sets a re-minted
    // session cookie on this very response -- `fetch` is same-origin, so the
    // browser has already stored it by the time we get here -- and `update()`
    // is what makes the React session object catch up with it.
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
