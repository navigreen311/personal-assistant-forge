'use client';

import { useState, useEffect } from 'react';
import ItineraryTimeline from '@/modules/travel/components/ItineraryTimeline';
import DocumentChecklist from '@/modules/travel/components/DocumentChecklist';
import FlightAlertBanner from '@/modules/travel/components/FlightAlertBanner';
import VisaRequirementCard from '@/modules/travel/components/VisaRequirementCard';
import type { Itinerary, TravelDocument, FlightAlert, VisaRequirement } from '@/modules/travel/types';

const sampleItinerary: Itinerary = {
  id: 'itin-1',
  userId: 'user-1',
  name: 'Tokyo Business Trip',
  status: 'CONFIRMED',
  legs: [
    {
      id: 'leg-1', order: 1, type: 'FLIGHT',
      departureLocation: 'DFW', arrivalLocation: 'NRT',
      departureTime: new Date('2026-03-15T08:00:00'), arrivalTime: new Date('2026-03-16T14:00:00'),
      timezone: 'America/Chicago', provider: 'American Airlines', costUsd: 1200, status: 'BOOKED',
    },
    {
      id: 'leg-2', order: 2, type: 'HOTEL',
      departureLocation: 'NRT', arrivalLocation: 'Tokyo Marriott',
      departureTime: new Date('2026-03-16T15:00:00'), arrivalTime: new Date('2026-03-20T11:00:00'),
      timezone: 'Asia/Tokyo', provider: 'Marriott', costUsd: 800, status: 'BOOKED',
    },
    {
      id: 'leg-3', order: 3, type: 'FLIGHT',
      departureLocation: 'NRT', arrivalLocation: 'DFW',
      departureTime: new Date('2026-03-20T16:00:00'), arrivalTime: new Date('2026-03-20T14:00:00'),
      timezone: 'Asia/Tokyo', provider: 'JAL', costUsd: 1100, status: 'BOOKED',
    },
  ],
  totalCostEstimate: 3100,
  currency: 'USD',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const sampleDocuments: TravelDocument[] = [
  { type: 'PASSPORT', number: 'US12345678', expirationDate: new Date('2028-06-15'), issuingCountry: 'US', isExpiringSoon: false },
  { type: 'GLOBAL_ENTRY', number: 'GE98765', expirationDate: new Date('2026-08-01'), issuingCountry: 'US', isExpiringSoon: true },
];

const sampleAlert: FlightAlert = {
  itineraryId: 'itin-1', legId: 'leg-1',
  alertType: 'DELAY', severity: 'WARNING',
  message: 'Flight AA 175 DFW→NRT delayed by 45 minutes',
  originalValue: '08:00', newValue: '08:45',
  timestamp: new Date(),
};

const sampleVisaReq: VisaRequirement = {
  destinationCountry: 'JP', citizenshipCountry: 'US',
  visaRequired: false, documentRequired: ['PASSPORT'],
  notes: 'US citizens can visit Japan for up to 90 days without a visa for tourism.',
};

export default function TravelDashboard() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Travel Management</h1>

      <FlightAlertBanner alert={sampleAlert} />

      <div className="bg-white rounded-lg shadow p-6">
        <ItineraryTimeline itinerary={sampleItinerary} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <DocumentChecklist documents={sampleDocuments} />
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <VisaRequirementCard requirement={sampleVisaReq} />
        </div>
      </div>
    </div>
  );
}
