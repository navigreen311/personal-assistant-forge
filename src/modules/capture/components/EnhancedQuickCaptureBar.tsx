'use client';

import { useState, useCallback, useRef, type FormEvent } from 'react';
import type { CaptureSource, CaptureContentType } from '@/modules/capture/types';

interface EnhancedQuickCaptureBarProps {
  onCapture: (params: {
    rawContent: string;
    source: CaptureSource;
    contentType: CaptureContentType;
    entityId?: string;
  }) => void;
  entities?: { id: string; name: string }[];
  selectedEntityId?: string;
}

type SourceButton = {
  key: string;
  label: string;
  source: CaptureSource;
  contentType: CaptureContentType;
  iconPath: string;
};

const SOURCE_BUTTONS: SourceButton[] = [
  {
    key: 'text',
    label: 'Text',
    source: 'MANUAL',
    contentType: 'TEXT',
    iconPath: 'M4 6h16M4 12h16M4 18h8',
  },
  {
    key: 'clipboard',
    label: 'Clipboard',
    source: 'CLIPBOARD',
    contentType: 'TEXT',
    iconPath:
      'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    key: 'camera',
    label: 'Screenshot',
    source: 'SCREENSHOT',
    contentType: 'SCREENSHOT',
    iconPath:
      'M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z',
  },
  {
    key: 'url',
    label: 'URL',
    source: 'BROWSER_EXTENSION',
    contentType: 'URL',
    iconPath:
      'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  },
];

export default function EnhancedQuickCaptureBar({
  onCapture,
  entities,
  selectedEntityId,
}: EnhancedQuickCaptureBarProps) {
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeSource, setActiveSource] = useState<string>('text');
  const [entityId, setEntityId] = useState<string>(selectedEntityId ?? '');
  const [batchMode, setBatchMode] = useState(false);
  const [batchCount, setBatchCount] = useState(0);
  const [emailCopied, setEmailCopied] = useState(false);
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const captureEmail = 'capture+uid@paf.ai';

  const selectedEntity = entities?.find((e) => e.id === entityId);

  const detectContentType = useCallback(
    (text: string): CaptureContentType => {
      if (/^https?:\/\//i.test(text)) return 'URL';
      if (/^data:image\//i.test(text)) return 'IMAGE';
      // Use the active source button's content type as a hint
      const activeBtn = SOURCE_BUTTONS.find((b) => b.key === activeSource);
      if (activeBtn && activeBtn.key !== 'text') return activeBtn.contentType;
      return 'TEXT';
    },
    [activeSource],
  );

  const detectSource = useCallback((): CaptureSource => {
    const activeBtn = SOURCE_BUTTONS.find((b) => b.key === activeSource);
    return activeBtn?.source ?? 'MANUAL';
  }, [activeSource]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isSubmitting) return;

      setIsSubmitting(true);
      try {
        const contentType = detectContentType(input);
        const source = detectSource();
        onCapture({
          rawContent: input.trim(),
          source,
          contentType,
          entityId: entityId || undefined,
        });

        if (batchMode) {
          setBatchCount((c) => c + 1);
          setInput('');
          inputRef.current?.focus();
        } else {
          setInput('');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [input, isSubmitting, onCapture, detectContentType, detectSource, entityId, batchMode],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData.items;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = reader.result as string;
              onCapture({
                rawContent: base64,
                source: 'CLIPBOARD',
                contentType: 'IMAGE',
                entityId: entityId || undefined,
              });
              if (batchMode) {
                setBatchCount((c) => c + 1);
              }
            };
            reader.readAsDataURL(blob);
          }
          return;
        }
      }
      // Text paste handled by normal input
    },
    [onCapture, entityId, batchMode],
  );

  const handleCopyEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(captureEmail);
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  }, [captureEmail]);

  const handleExitBatchMode = useCallback(() => {
    setBatchMode(false);
    setBatchCount(0);
  }, []);

  return (
    <div className="w-full rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Top bar: Entity selector + Batch mode toggle */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        {/* Entity selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setEntityDropdownOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
          >
            <span className="text-gray-400">Entity:</span>
            <span className="font-medium">
              {selectedEntity?.name ?? 'No entity'}
            </span>
            <svg
              className="h-3.5 w-3.5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {entityDropdownOpen && (
            <div className="absolute left-0 top-full z-10 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setEntityId('');
                  setEntityDropdownOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
                  !entityId ? 'font-medium text-blue-600' : 'text-gray-700'
                }`}
              >
                No entity
              </button>
              {entities?.map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  onClick={() => {
                    setEntityId(entity.id);
                    setEntityDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
                    entityId === entity.id
                      ? 'font-medium text-blue-600'
                      : 'text-gray-700'
                  }`}
                >
                  {entity.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Batch mode toggle */}
        <div className="flex items-center gap-2">
          {batchMode && batchCount > 0 && (
            <span className="text-xs text-gray-500">
              {batchCount} {batchCount === 1 ? 'item' : 'items'} captured
            </span>
          )}
          {batchMode ? (
            <button
              type="button"
              onClick={handleExitBatchMode}
              className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
            >
              Batch Mode: ON &mdash; Done
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setBatchMode(true)}
              className="rounded-lg px-3 py-1 text-xs font-medium text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            >
              Batch Mode: Off
            </button>
          )}
        </div>
      </div>

      {/* Main capture area */}
      <div className="px-4 py-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-3">
          {/* Source type buttons */}
          <div className="flex gap-1.5">
            {SOURCE_BUTTONS.map((btn) => (
              <button
                key={btn.key}
                type="button"
                onClick={() => setActiveSource(btn.key)}
                title={btn.label}
                className={`rounded-md p-1.5 transition-colors ${
                  activeSource === btn.key
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-300 hover:text-gray-500'
                }`}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={btn.iconPath}
                  />
                </svg>
              </button>
            ))}
          </div>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            placeholder="Quick capture — type, paste a URL, or paste an image..."
            className="flex-1 rounded-lg border-0 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Submit */}
          <button
            type="submit"
            disabled={!input.trim() || isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Capture
          </button>
        </form>
      </div>

      {/* Capture methods info row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span>Capture methods:</span>
        </span>

        {/* Email forward */}
        <span className="flex items-center gap-1">
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <span>
            Forward to:{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-gray-500">
              {captureEmail}
            </code>
          </span>
          <button
            type="button"
            onClick={handleCopyEmail}
            className="ml-0.5 rounded p-0.5 text-gray-300 hover:text-gray-500"
            title="Copy email address"
          >
            {emailCopied ? (
              <svg
                className="h-3 w-3 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            )}
          </button>
        </span>

        <span className="text-gray-300">|</span>

        {/* Share sheet */}
        <span className="flex items-center gap-1">
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span>Share sheet</span>
        </span>

        <span className="text-gray-300">|</span>

        {/* System tray */}
        <span className="flex items-center gap-1">
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <span>Tray</span>
        </span>

        <span className="text-gray-300">|</span>

        {/* Browser extension */}
        <span className="flex items-center gap-1">
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
            />
          </svg>
          <span>Extension</span>
        </span>
      </div>
    </div>
  );
}
