'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EntityForm } from '@/modules/entities/components/EntityForm';
import type { EntityFormData } from '@/modules/entities/components/EntityForm';

export default function CreateEntityPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(data: EntityFormData) {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        router.push(`/entities/${json.data.id}`);
      } else {
        setErrorMsg(json.error?.message ?? 'Failed to create entity');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Create Entity</h1>
      {errorMsg && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}
      <EntityForm
        onSubmit={handleSubmit}
        onCancel={() => router.push('/entities')}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
