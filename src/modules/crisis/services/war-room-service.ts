import { generateText } from '@/lib/ai';
import type { WarRoomState, CrisisEvent } from '../types';
import { getCrisisById, updateCrisis } from './detection-service';

export async function activateWarRoom(crisisId: string): Promise<WarRoomState> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);

  // Use AI to draft stakeholder communications
  let draftedComms: string[];
  try {
    const initialNotification = await generateText(
      `Draft an initial stakeholder notification for a ${crisis.type} crisis.
Title: ${crisis.title}
Severity: ${crisis.severity}
Description: ${crisis.description}
Detected at: ${crisis.detectedAt.toISOString()}
Participants notified: ${crisis.escalationChain.filter(s => s.status === 'ACKNOWLEDGED' || s.status === 'NOTIFIED').map(s => s.contactName).join(', ') || 'None yet'}

Draft 2 communications:
1. An initial notification to stakeholders (concise, factual, includes next steps)
2. A status update template that can be reused as the situation evolves

Separate them with "---".`,
      {
        temperature: 0.5,
        system: 'You are a crisis communications specialist. Draft clear, professional communications that inform without causing panic. Be factual and include concrete next steps.',
      }
    );

    draftedComms = initialNotification.split('---').map(s => s.trim()).filter(Boolean);
    if (draftedComms.length === 0) {
      draftedComms = [initialNotification];
    }
  } catch {
    draftedComms = [
      `Initial notification: ${crisis.title} detected at ${crisis.detectedAt.toISOString()}`,
      `Status update template for ${crisis.type} incident`,
    ];
  }

  crisis.warRoom = {
    isActive: true,
    activatedAt: new Date(),
    clearedCalendarEvents: ['team-standup', 'weekly-review', 'optional-sync'],
    surfacedDocuments: [`crisis-${crisis.type}-playbook`, 'emergency-contacts', 'incident-response-plan'],
    draftedComms,
    participants: crisis.escalationChain
      .filter(s => s.status === 'ACKNOWLEDGED' || s.status === 'NOTIFIED')
      .map(s => s.contactName),
  };

  updateCrisis(crisis);
  return crisis.warRoom;
}

export async function deactivateWarRoom(crisisId: string): Promise<void> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);

  crisis.warRoom.isActive = false;
  updateCrisis(crisis);
}

export async function getWarRoomState(crisisId: string): Promise<WarRoomState> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);
  return crisis.warRoom;
}

export async function addWarRoomDocument(crisisId: string, documentId: string): Promise<WarRoomState> {
  const crisis = getCrisisById(crisisId);
  if (!crisis) throw new Error(`Crisis ${crisisId} not found`);

  if (!crisis.warRoom.surfacedDocuments.includes(documentId)) {
    crisis.warRoom.surfacedDocuments.push(documentId);
  }

  updateCrisis(crisis);
  return crisis.warRoom;
}
