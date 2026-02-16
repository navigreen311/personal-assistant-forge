import { v4 as uuidv4 } from 'uuid';
import { generateJSON } from '@/lib/ai';
import type { CrisisDetectionSignal, CrisisType, CrisisSeverity, CrisisEvent, CrisisStatus } from '../types';
import { getEscalationChain } from './escalation-service';
import { getPlaybook } from './playbook-service';

const crisisStore = new Map<string, CrisisEvent>();

export async function analyzeSignals(signals: CrisisDetectionSignal[]): Promise<{
  isCrisis: boolean;
  type?: CrisisType;
  severity?: CrisisSeverity;
  confidence: number;
  explanation: string;
}> {
  if (signals.length === 0) {
    return { isCrisis: false, confidence: 0, explanation: 'No signals to analyze.' };
  }

  // LEGAL_THREAT detection
  const legalKeywords = ['lawsuit', 'subpoena', 'legal action', 'cease and desist'];
  const legalSignals = signals.filter(s =>
    legalKeywords.some(kw => {
      const body = (s.rawData.body as string || s.rawData.message as string || '').toLowerCase();
      return body.includes(kw);
    })
  );
  if (legalSignals.length > 0) {
    const confidence = Math.min(1, legalSignals.reduce((sum, s) => sum + s.confidence, 0) / legalSignals.length);
    return {
      isCrisis: true,
      type: 'LEGAL_THREAT',
      severity: confidence > 0.8 ? 'CRITICAL' : confidence > 0.5 ? 'HIGH' : 'MEDIUM',
      confidence,
      explanation: `Legal threat detected: signals contain legal keywords (${legalKeywords.filter(kw => legalSignals.some(s => ((s.rawData.body as string || s.rawData.message as string || '').toLowerCase()).includes(kw))).join(', ')}).`,
    };
  }

  // PR_ISSUE detection: multiple negative sentiment signals from different contacts within 24h
  const negativeSignals = signals.filter(s => s.signalType === 'negative_sentiment' || (s.rawData.sentiment as number) < -0.5);
  const uniqueContacts = new Set(negativeSignals.map(s => s.rawData.contactId as string).filter(Boolean));
  if (uniqueContacts.size >= 2) {
    const oldest = Math.min(...negativeSignals.map(s => new Date(s.timestamp).getTime()));
    const newest = Math.max(...negativeSignals.map(s => new Date(s.timestamp).getTime()));
    const hoursDiff = (newest - oldest) / (1000 * 60 * 60);
    if (hoursDiff <= 24) {
      return {
        isCrisis: true,
        type: 'PR_ISSUE',
        severity: uniqueContacts.size >= 5 ? 'CRITICAL' : uniqueContacts.size >= 3 ? 'HIGH' : 'MEDIUM',
        confidence: 0.75,
        explanation: `PR issue detected: ${uniqueContacts.size} different contacts sent negative sentiment messages within ${Math.round(hoursDiff)} hours.`,
      };
    }
  }

  // HEALTH_EMERGENCY detection
  const cancellations = signals.filter(s => s.signalType === 'calendar_cancellation');
  const missedCheckins = signals.filter(s => s.signalType === 'missed_checkin');
  const medicalMessages = signals.filter(s => {
    const body = (s.rawData.body as string || s.rawData.message as string || '').toLowerCase();
    return body.includes('hospital') || body.includes('emergency') || body.includes('medical') || body.includes('doctor');
  });
  if (cancellations.length > 0 && missedCheckins.length > 0 && medicalMessages.length > 0) {
    return {
      isCrisis: true,
      type: 'HEALTH_EMERGENCY',
      severity: 'CRITICAL',
      confidence: 0.85,
      explanation: 'Health emergency detected: calendar cancellations, missed check-ins, and medical-related messages found.',
    };
  }

  // FINANCIAL_ANOMALY detection
  const financialSignals = signals.filter(s => s.source === 'financial');
  if (financialSignals.length > 0) {
    const amounts = financialSignals.map(s => s.rawData.amount as number).filter(Boolean);
    if (amounts.length > 0) {
      const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const largeTransactions = amounts.filter(a => a > avg * 3);
      const sameDayMultiple = financialSignals.length >= 3;
      if (largeTransactions.length > 0 || sameDayMultiple) {
        return {
          isCrisis: true,
          type: 'FINANCIAL_ANOMALY',
          severity: largeTransactions.length > 0 ? 'HIGH' : 'MEDIUM',
          confidence: 0.7,
          explanation: `Financial anomaly detected: ${largeTransactions.length > 0 ? 'transactions exceeding 3x average' : 'multiple transactions in short period'}.`,
        };
      }
    }
  }

  // DATA_BREACH detection
  const securitySignals = signals.filter(s => {
    const body = (s.rawData.body as string || s.rawData.message as string || '').toLowerCase();
    return body.includes('breach') || body.includes('unauthorized access') || body.includes('security incident') || body.includes('compromised');
  });
  const accessPatterns = signals.filter(s => s.signalType === 'unusual_access');
  if (securitySignals.length > 0 || accessPatterns.length >= 2) {
    return {
      isCrisis: true,
      type: 'DATA_BREACH',
      severity: 'CRITICAL',
      confidence: 0.8,
      explanation: 'Data breach detected: security-related messages and/or unusual access patterns identified.',
    };
  }

  // CLIENT_COMPLAINT detection
  const complaintSignals = signals.filter(s => {
    const body = (s.rawData.body as string || s.rawData.message as string || '').toLowerCase();
    return body.includes('complaint') || body.includes('unacceptable') || body.includes('disappointed') || body.includes('furious');
  });
  if (complaintSignals.length >= 2) {
    const oldest = Math.min(...complaintSignals.map(s => new Date(s.timestamp).getTime()));
    const newest = Math.max(...complaintSignals.map(s => new Date(s.timestamp).getTime()));
    const hoursDiff = (newest - oldest) / (1000 * 60 * 60);
    if (hoursDiff <= 48) {
      return {
        isCrisis: true,
        type: 'CLIENT_COMPLAINT',
        severity: complaintSignals.length >= 5 ? 'HIGH' : 'MEDIUM',
        confidence: 0.7,
        explanation: `Client complaint crisis detected: ${complaintSignals.length} complaint messages within ${Math.round(hoursDiff)} hours.`,
      };
    }
  }

  // AI second-pass analysis: when keyword matching doesn't find a clear pattern
  try {
    const signalSummaries = signals.map(s => ({
      source: s.source,
      type: s.signalType,
      confidence: s.confidence,
      data: s.rawData,
      time: s.timestamp,
    }));

    const aiResult = await generateJSON<{
      isCrisis: boolean;
      type?: CrisisType;
      severity?: CrisisSeverity;
      confidence: number;
      explanation: string;
    }>(
      `Analyze these signals to determine if a crisis is occurring.

Signals: ${JSON.stringify(signalSummaries, null, 2)}

Valid crisis types: LEGAL_THREAT, PR_ISSUE, HEALTH_EMERGENCY, FINANCIAL_ANOMALY, DATA_BREACH, CLIENT_COMPLAINT, REGULATORY_INQUIRY, NATURAL_DISASTER
Valid severities: LOW, MEDIUM, HIGH, CRITICAL

Return a JSON object with:
- "isCrisis": boolean (true if signals indicate a crisis)
- "type": crisis type string (only if isCrisis is true)
- "severity": severity string (only if isCrisis is true)
- "confidence": number 0-1 representing your confidence
- "explanation": brief explanation of your reasoning

Be conservative: only flag a crisis if signals clearly indicate one. False negatives are preferable to false positives for safety-critical detection.`,
      {
        temperature: 0.2,
        system: 'You are a crisis detection analyst. Analyze signals conservatively — only flag a crisis when evidence is clear. Err on the side of caution. When in doubt, set isCrisis to false.',
      }
    );

    return {
      isCrisis: aiResult.isCrisis ?? false,
      type: aiResult.type,
      severity: aiResult.severity,
      confidence: aiResult.confidence ?? 0.1,
      explanation: aiResult.explanation ?? 'AI analysis completed.',
    };
  } catch {
    // Fallback: no pattern matched and AI unavailable
    return {
      isCrisis: false,
      confidence: 0.1,
      explanation: 'No crisis patterns detected in the provided signals.',
    };
  }
}

export async function createCrisisEvent(
  userId: string,
  entityId: string,
  type: CrisisType,
  severity: CrisisSeverity,
  title: string,
  description: string
): Promise<CrisisEvent> {
  const chainConfig = getEscalationChain(type);
  const playbook = getPlaybook(type);

  const crisis: CrisisEvent = {
    id: uuidv4(),
    userId,
    entityId,
    type,
    severity,
    status: 'DETECTED',
    title,
    description,
    detectedAt: new Date(),
    escalationChain: chainConfig.steps.map(step => ({
      ...step,
      status: 'PENDING' as const,
    })),
    playbook,
    warRoom: {
      isActive: false,
      clearedCalendarEvents: [],
      surfacedDocuments: [],
      draftedComms: [],
      participants: [],
    },
  };

  crisisStore.set(crisis.id, crisis);
  return crisis;
}

export async function getActiveCrises(userId: string): Promise<CrisisEvent[]> {
  return Array.from(crisisStore.values()).filter(
    c => c.userId === userId && c.status !== 'RESOLVED' && c.status !== 'POST_MORTEM'
  );
}

// Exported for testing and other services
export function getCrisisById(crisisId: string): CrisisEvent | undefined {
  return crisisStore.get(crisisId);
}

export function updateCrisis(crisis: CrisisEvent): void {
  crisisStore.set(crisis.id, crisis);
}
