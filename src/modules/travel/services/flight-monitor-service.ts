import { v4 as uuidv4 } from 'uuid';
import { generateText } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { FlightAlert, Itinerary, ItineraryLeg, DisruptionResponse } from '../types';
import { getItinerary } from './itinerary-service';

/**
 * NO AIRLINE IS CALLED HERE.
 *
 * `flightStatus` and `delayMinutes` are read out of the itinerary's own
 * `prepPacket` JSON -- values something else wrote into this database. There is
 * no flight-status provider wired up, so a real delay produces no alert. This
 * function reports what the record already says; it does not discover anything.
 */
export async function checkFlightStatus(
  entityId: VerifiedEntityId,
  itineraryId: string
): Promise<FlightAlert[]> {
  const itinerary = await getItinerary(entityId, itineraryId);
  if (!itinerary) return [];

  const alerts: FlightAlert[] = [];
  const flightLegs = itinerary.legs.filter(leg => leg.type === 'FLIGHT');

  // Query CalendarEvent records that belong to this itinerary
  const calendarEvents = await prisma.calendarEvent.findMany({
    where: {
      entityId,
      prepPacket: {
        path: ['itineraryId'],
        equals: itineraryId,
      },
    },
  });

  for (const leg of flightLegs) {
    // Find the matching calendar event for this leg
    const event = calendarEvents.find((ce: { prepPacket: unknown }) => {
      const meta = ce.prepPacket as Record<string, unknown> | null;
      return meta?.legId === leg.id;
    });

    if (!event) continue;

    const meta = event.prepPacket as Record<string, unknown> | null;
    const flightStatus = meta?.flightStatus as string | undefined;

    if (flightStatus === 'DELAYED') {
      const delayMinutes = (meta?.delayMinutes as number) ?? 60;
      const alert: FlightAlert = {
        itineraryId,
        legId: leg.id,
        alertType: 'DELAY',
        severity: delayMinutes > 60 ? 'WARNING' : 'INFO',
        message: `Flight from ${leg.departureLocation} to ${leg.arrivalLocation} delayed by ${delayMinutes} minutes`,
        originalValue: leg.departureTime.toString(),
        newValue: new Date(new Date(leg.departureTime).getTime() + delayMinutes * 60000).toString(),
        timestamp: new Date(),
      };
      alerts.push(alert);

      // Store alert as Notification
      await prisma.notification.create({
        data: {
          id: uuidv4(),
          userId: itinerary.userId,
          type: 'flight_alert',
          title: `Flight Delayed: ${leg.departureLocation} → ${leg.arrivalLocation}`,
          body: alert.message,
          priority: alert.severity === 'WARNING' ? 'high' : 'normal',
          metadata: {
            itineraryId: alert.itineraryId,
            legId: alert.legId,
            alertType: alert.alertType,
            severity: alert.severity,
            originalValue: alert.originalValue,
            newValue: alert.newValue,
            timestamp: alert.timestamp.toISOString(),
          },
        },
      });
    } else if (flightStatus === 'CANCELLED') {
      const alert: FlightAlert = {
        itineraryId,
        legId: leg.id,
        alertType: 'CANCELLATION',
        severity: 'CRITICAL',
        message: `Flight from ${leg.departureLocation} to ${leg.arrivalLocation} has been cancelled`,
        timestamp: new Date(),
      };
      alerts.push(alert);

      await prisma.notification.create({
        data: {
          id: uuidv4(),
          userId: itinerary.userId,
          type: 'flight_alert',
          title: `Flight Cancelled: ${leg.departureLocation} → ${leg.arrivalLocation}`,
          body: alert.message,
          priority: 'urgent',
          metadata: {
            itineraryId: alert.itineraryId,
            legId: alert.legId,
            alertType: alert.alertType,
            severity: alert.severity,
            timestamp: alert.timestamp.toISOString(),
          },
        },
      });
    }
  }

  return alerts;
}

/**
 * THE ALTERNATIVES BELOW ARE NOT REAL FLIGHTS.
 *
 * No booking or search provider is integrated. "Alternative Airline A" and
 * "Alternative Airline B" are the original leg with an hour or two added and the
 * price scaled by 1.1 and 0.95. They are not bookable, the times are not
 * schedules, and the prices are arithmetic.
 *
 * The response now carries `isSimulated: true` so a caller cannot mistake this
 * for a rebooking option, and the AI-written `reason` says so in words. Left in
 * place rather than deleted because the disruption flow around it is real and
 * this is the seam a provider would plug into -- but it must not be presented to
 * a traveller as a flight they can take.
 */
export async function generateDisruptionResponse(
  alert: FlightAlert,
  itinerary: Itinerary
): Promise<DisruptionResponse> {
  const originalLeg = itinerary.legs.find(l => l.id === alert.legId);
  if (!originalLeg) throw new Error(`Leg ${alert.legId} not found`);

  // Simulated alternatives -- see the note above. Not bookable.
  const alternatives: ItineraryLeg[] = [
    {
      ...originalLeg,
      id: uuidv4(),
      provider: 'Example alternative A (simulated -- not bookable)',
      departureTime: new Date(new Date(originalLeg.departureTime).getTime() + 3600000),
      arrivalTime: new Date(new Date(originalLeg.arrivalTime).getTime() + 3600000),
      costUsd: originalLeg.costUsd * 1.1,
      status: 'PENDING',
    },
    {
      ...originalLeg,
      id: uuidv4(),
      provider: 'Example alternative B (simulated -- not bookable)',
      departureTime: new Date(new Date(originalLeg.departureTime).getTime() + 7200000),
      arrivalTime: new Date(new Date(originalLeg.arrivalTime).getTime() + 7200000),
      costUsd: originalLeg.costUsd * 0.95,
      status: 'PENDING',
    },
  ];

  const recommendation = alternatives[1]; // Cheaper option

  // Use AI to generate a detailed explanation for the recommendation
  let reason: string;
  try {
    reason = await generateText(
      `A flight from ${originalLeg.departureLocation} to ${originalLeg.arrivalLocation} was ${alert.alertType === 'CANCELLATION' ? 'cancelled' : 'delayed'}.
The recommended alternative is with ${recommendation.provider}, departing at ${recommendation.departureTime.toISOString()} (${recommendation.costUsd > originalLeg.costUsd ? 'costs $' + (recommendation.costUsd - originalLeg.costUsd).toFixed(2) + ' more' : 'saves $' + (originalLeg.costUsd - recommendation.costUsd).toFixed(2)}).
Other alternative: ${alternatives[0].provider} departing at ${alternatives[0].departureTime.toISOString()} at $${alternatives[0].costUsd.toFixed(2)}.

Explain in 2-3 sentences why the recommended alternative is the best choice considering cost, timing, and travel disruption impact.`,
      {
        temperature: 0.7,
        system: 'You are a travel disruption advisor. Provide concise, practical explanations for flight alternative recommendations.',
      }
    );
  } catch {
    reason = 'Recommended based on lower cost and reasonable timing';
  }

  return {
    originalLeg,
    alternatives,
    recommendation,
    isSimulated: true,
    reason:
      'These alternatives are simulated placeholders, not real or bookable ' +
      `flights; no booking provider is integrated. ${reason}`,
    additionalCost: recommendation.costUsd - originalLeg.costUsd,
  };
}

export async function getActiveAlerts(userId: string): Promise<FlightAlert[]> {
  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      type: 'flight_alert',
    },
    orderBy: { createdAt: 'desc' },
  });

  return notifications.map((n: { body: string; createdAt: Date; metadata: unknown }) => {
    const meta = n.metadata as Record<string, unknown> | null;
    return {
      itineraryId: (meta?.itineraryId as string) ?? '',
      legId: (meta?.legId as string) ?? '',
      alertType: (meta?.alertType as FlightAlert['alertType']) ?? 'DELAY',
      severity: (meta?.severity as FlightAlert['severity']) ?? 'INFO',
      message: n.body,
      originalValue: meta?.originalValue as string | undefined,
      newValue: meta?.newValue as string | undefined,
      timestamp: meta?.timestamp ? new Date(meta.timestamp as string) : n.createdAt,
    };
  });
}
