'use client';

interface Props {
  notificationId: string;
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | string;
  sourceType?: string;
  sourceId?: string;
}

/**
 * "Talk me through this" button on a notification card.
 *
 * Only renders for P0/P1 notifications. Opens the Shadow panel via the
 * global `shadow:toggle` event and hands the agent a seed message it can
 * coach off of. The seed uses the `[TALK_ME_THROUGH]` sentinel so the
 * agent's intent classifier can route it to the walkthrough/coaching path.
 */
export function TalkMeThroughButton({
  notificationId,
  title,
  description,
  priority,
  sourceType,
  sourceId,
}: Props) {
  if (priority !== 'P0' && priority !== 'P1') return null;

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('shadow:toggle'));
    const source = sourceType && sourceId ? `${sourceType}/${sourceId}` : 'unknown';
    window.dispatchEvent(
      new CustomEvent('shadow:seed-message', {
        detail: {
          text: `[TALK_ME_THROUGH] Notification ${notificationId}: ${title}. ${description}. Source: ${source}`,
        },
      }),
    );
  };

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 transition-colors"
    >
      <span aria-hidden="true">📞</span>
      <span>Talk me through this</span>
    </button>
  );
}
