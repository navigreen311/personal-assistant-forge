'use client';

import { useState, useEffect } from 'react';
import ItineraryTimeline from '@/modules/travel/components/ItineraryTimeline';
import DocumentChecklist from '@/modules/travel/components/DocumentChecklist';
import FlightAlertBanner from '@/modules/travel/components/FlightAlertBanner';
import VisaRequirementCard from '@/modules/travel/components/VisaRequirementCard';
import type { Itinerary, TravelDocument, FlightAlert, VisaRequirement } from '@/modules/travel/types';

export default function TravelDashboard() {
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [alerts, setAlerts] = useState<FlightAlert[]>([]);
  const [visaReqs, setVisaReqs] = useState<VisaRequirement[]>([]);
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [itinRes, prefsRes] = await Promise.all([
          fetch('/api/travel/itineraries'),
          fetch('/api/travel/preferences'),
        ]);

        if (itinRes.ok) {
          const itinData = await itinRes.json();
          const itinList: Itinerary[] = itinData.data ?? [];
          setItineraries(itinList);

          // Collect flight alerts from all itineraries
          const allAlerts: FlightAlert[] = [];
          for (const itin of itinList) {
            try {
              const alertRes = await fetch(`/api/travel/itineraries/${itin.id}/alerts`);
              if (alertRes.ok) {
                const alertData = await alertRes.json();
                allAlerts.push(...(alertData.data ?? []));
              }
            } catch {
              // Ignore per-itinerary alert fetch errors
            }
          }
          setAlerts(allAlerts);
        }

        if (prefsRes.ok) {
          const prefsData = await prefsRes.json();
          setDocuments(prefsData.data?.travelDocuments ?? []);
        }
      } catch (err) {
        console.error('Failed to fetch travel data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Travel Management</h1>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <span className="ml-3 text-gray-500">Loading travel data...</span>
        </div>
      </div>
    );
  }

  const hasData = itineraries.length > 0 || alerts.length > 0;

  if (!hasData) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Travel Management</h1>
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-500 text-lg">No travel itineraries found.</p>
          <p className="text-gray-400 mt-2">Create a new itinerary to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Travel Management</h1>

      {alerts.map((alert, i) => (
        <FlightAlertBanner key={`${alert.itineraryId}-${alert.legId}-${i}`} alert={alert} />
      ))}

      {itineraries.map(itin => (
        <div key={itin.id} className="bg-white rounded-lg shadow p-6">
          <ItineraryTimeline itinerary={itin} />
        </div>
      ))}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {documents.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <DocumentChecklist documents={documents} />
          </div>
        )}
        {visaReqs.map((req, i) => (
          <div key={`${req.citizenshipCountry}-${req.destinationCountry}-${i}`} className="bg-white rounded-lg shadow p-6">
            <VisaRequirementCard requirement={req} />
          </div>
        ))}
      </div>
    </div>
  );
}
