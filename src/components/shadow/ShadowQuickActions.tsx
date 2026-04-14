'use client';

import { usePathname } from 'next/navigation';

interface QuickAction {
  label: string;
  message: string;
  icon: string;
}

const pageActions: Record<string, QuickAction[]> = {
  '/dashboard': [
    { label: 'Morning briefing', message: 'Give me my morning briefing', icon: '☀' },
    { label: 'Priority tasks', message: "What are today's priority tasks?", icon: '📋' },
    { label: 'Quick stats', message: 'Show me a quick stats summary', icon: '📊' },
  ],
  '/inbox': [
    { label: 'Triage inbox', message: 'Help me triage my inbox', icon: '📧' },
    { label: 'Draft responses', message: 'Draft responses for emails that need replies', icon: '✏' },
    { label: 'Show urgent', message: 'Show me only urgent emails', icon: '🚨' },
  ],
  '/tasks': [
    { label: 'Overdue tasks', message: 'Show me overdue tasks', icon: '⏰' },
    { label: 'Create task', message: 'Help me create a new task', icon: '➕' },
    { label: "Today's tasks", message: "What's due today?", icon: '📋' },
  ],
  '/calendar': [
    { label: "Today's schedule", message: "What's on my calendar today?", icon: '📅' },
    { label: 'Find free time', message: 'When am I free this week?', icon: '🔍' },
    { label: 'Any conflicts?', message: 'Do I have any calendar conflicts?', icon: '⚠' },
  ],
  '/finance': [
    { label: 'Overdue invoices', message: 'Show me overdue invoices', icon: '💰' },
    { label: 'Cash flow', message: "How's my cash flow looking?", icon: '📊' },
    { label: 'Budget status', message: "What's my budget status?", icon: '💵' },
  ],
};

const defaultActions: QuickAction[] = [
  { label: "Today's priorities", message: "What should I focus on today?", icon: '🎯' },
  { label: 'Check inbox', message: 'Anything important in my inbox?', icon: '📧' },
  { label: "What's next?", message: "What's my next meeting or deadline?", icon: '⏭' },
];

interface Props {
  onSend: (message: string) => void;
  hasMessages: boolean;
}

export function ShadowQuickActions({ onSend, hasMessages }: Props) {
  const pathname = usePathname();

  if (hasMessages) return null;

  const basePath = '/' + (pathname?.split('/')[1] || 'dashboard');
  const actions = pageActions[basePath] || defaultActions;

  return (
    <div className="flex flex-wrap gap-1.5 px-3 pb-2">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => onSend(action.message)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 dark:hover:bg-indigo-900/20 transition-colors"
        >
          <span>{action.icon}</span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
