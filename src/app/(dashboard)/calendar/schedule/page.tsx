'use client';

import { ScheduleWizard } from '@/modules/calendar/components/ScheduleWizard';

export default function SchedulePage() {
  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '32px 24px' }}>
      <h1 style={{ margin: '0 0 8px', fontSize: '24px', fontWeight: 700 }}>Schedule an Event</h1>
      <p style={{ margin: '0 0 32px', color: '#6b7280', fontSize: '14px' }}>
        Use natural language or the structured form to find the best time.
      </p>
      <ScheduleWizard
        onScheduled={() => {
          window.location.href = '/calendar';
        }}
      />
    </div>
  );
}
