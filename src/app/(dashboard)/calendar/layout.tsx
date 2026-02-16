import type { ReactNode } from 'react';

export const metadata = {
  title: 'Calendar — PersonalAssistantForge',
  description: 'Smart calendar with energy-aware scheduling and conflict detection',
};

export default function CalendarLayout({ children }: { children: ReactNode }) {
  return (
    <section style={{ minHeight: '100vh', background: '#f9fafb' }}>
      {children}
    </section>
  );
}
