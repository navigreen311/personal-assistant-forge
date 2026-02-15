'use client';

import type { EffectsTree, SecondOrderEffect } from '@/modules/decisions/types';

interface EffectsTreeViewProps {
  tree: EffectsTree;
}

const SENTIMENT_COLORS = {
  POSITIVE: 'border-green-300 bg-green-50 text-green-800',
  NEGATIVE: 'border-red-300 bg-red-50 text-red-800',
  NEUTRAL: 'border-gray-300 bg-gray-50 text-gray-700',
};

const SENTIMENT_DOTS = {
  POSITIVE: 'bg-green-400',
  NEGATIVE: 'bg-red-400',
  NEUTRAL: 'bg-gray-400',
};

export default function EffectsTreeView({ tree }: EffectsTreeViewProps) {
  const rootEffects = tree.effects.filter((e) => e.order === 1);

  const getChildren = (parentId: string): SecondOrderEffect[] =>
    tree.effects.filter((e) => e.parentEffectId === parentId);

  const renderEffect = (effect: SecondOrderEffect, depth: number) => (
    <div key={effect.id} style={{ marginLeft: depth * 24 }}>
      <div
        className={`rounded border px-3 py-2 mb-1 ${SENTIMENT_COLORS[effect.sentiment]}`}
      >
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${SENTIMENT_DOTS[effect.sentiment]}`} />
          <span className="text-xs font-medium uppercase text-gray-500">
            {effect.order === 1 ? '1st' : effect.order === 2 ? '2nd' : '3rd'} Order
          </span>
          <span className="text-xs text-gray-400">
            ({Math.round(effect.likelihood * 100)}% likely)
          </span>
        </div>
        <p className="mt-1 text-sm">{effect.description}</p>
        {effect.affectedAreas.length > 0 && (
          <div className="mt-1 flex gap-1 flex-wrap">
            {effect.affectedAreas.map((area) => (
              <span
                key={area}
                className="inline-block rounded bg-white/50 px-1.5 py-0.5 text-xs"
              >
                {area}
              </span>
            ))}
          </div>
        )}
      </div>
      {getChildren(effect.id).map((child) => renderEffect(child, depth + 1))}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">Effects Tree</h4>
        <div className="flex gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400" /> +{tree.totalPositive}
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400" /> -{tree.totalNegative}
          </span>
          <span>Net: {tree.netSentiment.toFixed(2)}</span>
        </div>
      </div>

      <div className="rounded bg-gray-50 p-3 mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase">Root Action</span>
        <p className="text-sm text-gray-900">{tree.rootAction}</p>
      </div>

      <div className="space-y-0.5">
        {rootEffects.map((effect) => renderEffect(effect, 0))}
      </div>
    </div>
  );
}
