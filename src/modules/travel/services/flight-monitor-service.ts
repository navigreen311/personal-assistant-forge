import { v4 as uuidv4 } from 'uuid';
import type { FlightAlert, Itinerary, ItineraryLeg, DisruptionResponse } from '../types';
import { getItinerary, listItineraries } from './itinerary-service';

const alertStore = new Map<string, FlightAlert[]>();

export async function checkFlightStatus(itineraryId: string): Promise<FlightAlert[]> {
  const itinerary = await getItinerary(itineraryId);
  if (!itinerary) return [];

  const alerts: FlightAlert[] = [];
  const flightLegs = itinerary.legs.filter(leg => leg.type === 'FLIGHT');

  for (const leg of flightLegs) {
    // Simulate: 20% chance of delay, 5% chance of cancellation
    const rand = Math.random();
    if (rand < 0.05) {
      alerts.push({
        itineraryId,
        legId: leg.id,
        alertType: 'CANCELLATION',
        severity: 'CRITICAL',
        message: `Flight from ${leg.departureLocation} to ${leg.arrivalLocation} has been cancelled`,
        timestamp: new Date(),
      });
    } else if (rand < 0.25) {
      const delayMinutes = Math.floor(Math.random() * 180) + 15;
      alerts.push({
        itineraryId,
        legId: leg.id,
        alertType: 'DELAY',
        severity: delayMinutes > 60 ? 'WARNING' : 'INFO',
        message: `Flight from ${leg.departureLocation} to ${leg.arrivalLocation} delayed by ${delayMinutes} minutes`,
        originalValue: leg.departureTime.toString(),
        newValue: new Date(new Date(leg.departureTime).getTime() + delayMinutes * 60000).toString(),
        timestamp: new Date(),
      });
    }
  }

  // Store alerts
  const existing = alertStore.get(itineraryId) ?? [];
  alertStore.set(itineraryId, [...existing, ...alerts]);

  return alerts;
}

export async function generateDisruptionResponse(
  alert: FlightAlert,
  itinerary: Itinerary
): Promise<DisruptionResponse> {
  const originalLeg = itinerary.legs.find(l => l.id === alert.legId);
  if (!originalLeg) throw new Error(`Leg ${alert.legId} not found`);

  // Generate simulated alternatives
  const alternatives: ItineraryLeg[] = [
    {
      ...originalLeg,
      id: uuidv4(),
      provider: 'Alternative Airline A',
      departureTime: new Date(new Date(originalLeg.departureTime).getTime() + 3600000),
      arrivalTime: new Date(new Date(originalLeg.arrivalTime).getTime() + 3600000),
      costUsd: originalLeg.costUsd * 1.1,
      status: 'PENDING',
    },
    {
      ...originalLeg,
      id: uuidv4(),
      provider: 'Alternative Airline B',
      departureTime: new Date(new Date(originalLeg.departureTime).getTime() + 7200000),
      arrivalTime: new Date(new Date(originalLeg.arrivalTime).getTime() + 7200000),
      costUsd: originalLeg.costUsd * 0.95,
      status: 'PENDING',
    },
  ];

  const recommendation = alternatives[1]; // Cheaper option
  return {
    originalLeg,
    alternatives,
    recommendation,
    reason: 'Recommended based on lower cost and reasonable timing',
    additionalCost: recommendation.costUsd - originalLeg.costUsd,
  };
}

export async function getActiveAlerts(userId: string): Promise<FlightAlert[]> {
  const itineraries = await listItineraries(userId);
  const alerts: FlightAlert[] = [];

  for (const itin of itineraries) {
    const itinAlerts = alertStore.get(itin.id) ?? [];
    alerts.push(...itinAlerts);
  }

  return alerts;
}
