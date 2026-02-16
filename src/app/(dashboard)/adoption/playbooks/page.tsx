'use client';

import { useState, useEffect } from 'react';
import PlaybookLibrary from '@/engines/adoption/components/PlaybookLibrary';
import type { Playbook } from '@/engines/adoption/types';

export default function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);

  useEffect(() => {
    async function loadPlaybooks() {
      const { getDefaultPlaybooks } = await import('@/engines/adoption/playbook-service');
      setPlaybooks(getDefaultPlaybooks());
    }
    loadPlaybooks();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Playbook Library</h2>
        <p className="text-gray-500 mt-1">
          Pre-built automation recipes to save time on common tasks.
        </p>
      </div>

      <PlaybookLibrary playbooks={playbooks} />
    </div>
  );
}
