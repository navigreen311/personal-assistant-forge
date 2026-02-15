'use client';

import type { Playbook } from '../types';

interface Props {
  playbook: Playbook;
  onActivate: (id: string) => void;
}

export default function PlaybookCard({ playbook, onActivate }: Props) {
  const starsArr = Array.from({ length: 5 }, (_, i) => i < Math.round(playbook.rating));

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{playbook.name}</h3>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded mt-1 inline-block">
            {playbook.category}
          </span>
        </div>
        <span className="text-sm font-medium text-green-600 whitespace-nowrap">
          ~{playbook.estimatedTimeSavedMinutes}m/day
        </span>
      </div>

      <p className="text-sm text-gray-600 mb-3">{playbook.description}</p>

      <div className="mb-3">
        <p className="text-xs font-medium text-gray-500 mb-1">Steps ({playbook.steps.length})</p>
        <div className="space-y-1">
          {playbook.steps.slice(0, 3).map((step) => (
            <div key={step.order} className="flex items-center gap-2 text-xs text-gray-500">
              <span className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-medium">
                {step.order}
              </span>
              <span>{step.title}</span>
              {step.isOptional && <span className="text-gray-400">(optional)</span>}
            </div>
          ))}
          {playbook.steps.length > 3 && (
            <p className="text-xs text-gray-400">+{playbook.steps.length - 3} more steps</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-0.5">
          {starsArr.map((filled, i) => (
            <svg key={i} className={`w-4 h-4 ${filled ? 'text-yellow-400' : 'text-gray-300'}`} fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
          <span className="text-xs text-gray-500 ml-1">{playbook.rating}</span>
        </div>

        <button
          onClick={() => onActivate(playbook.id)}
          className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-md hover:bg-blue-700 transition-colors"
        >
          Activate
        </button>
      </div>
    </div>
  );
}
