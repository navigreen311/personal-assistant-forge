'use client';

import { useState } from 'react';
import type { Contact } from '@/shared/types';
import ContactList from '@/modules/communication/components/ContactList';
import ContactDetailPanel from '@/modules/communication/components/ContactDetailPanel';

export default function ContactsPage() {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contacts CRM</h1>
        <p className="text-sm text-gray-500 mt-1">Manage relationships, track commitments, and monitor follow-up cadence.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className={selectedContact ? 'lg:col-span-1' : 'lg:col-span-3'}>
          <ContactList onSelectContact={setSelectedContact} />
        </div>

        {selectedContact && (
          <div className="lg:col-span-2">
            <ContactDetailPanel
              contact={selectedContact}
              onClose={() => setSelectedContact(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
