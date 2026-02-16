'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import type { Entity } from '@/shared/types';
import { EntityForm } from '@/modules/entities/components/EntityForm';
import type { EntityFormData } from '@/modules/entities/components/EntityForm';

export default function EditEntityPage({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  const { entityId } = use(params);
  const router = useRouter();
  const [entity, setEntity] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function fetchEntity() {
      try {
        const res = await fetch(`/api/entities/${entityId}`);
        const json = await res.json();
        if (json.success) {
          setEntity(json.data);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchEntity();
  }, [entityId]);

  async function handleSubmit(data: EntityFormData) {
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/entities/${entityId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        router.push(`/entities/${entityId}`);
      } else {
        setErrorMsg(json.error?.message ?? 'Failed to update entity');
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <p className="text-gray-500">Entity not found.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Edit {entity.name}
      </h1>
      {errorMsg && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}
      <EntityForm
        entity={entity}
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/entities/${entityId}`)}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
