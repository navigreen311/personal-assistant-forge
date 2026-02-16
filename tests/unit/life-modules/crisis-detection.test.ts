import { analyzeSignals } from '@/modules/crisis/services/detection-service';
import type { CrisisDetectionSignal } from '@/modules/crisis/types';

describe('analyzeSignals', () => {
  it('should detect LEGAL_THREAT from legal keyword signals', async () => {
    const signals: CrisisDetectionSignal[] = [
      {
        source: 'message',
        signalType: 'incoming_message',
        confidence: 0.9,
        rawData: { body: 'We are filing a lawsuit against your company' },
        timestamp: new Date(),
      },
    ];
    const result = await analyzeSignals(signals);
    expect(result.isCrisis).toBe(true);
    expect(result.type).toBe('LEGAL_THREAT');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('should detect LEGAL_THREAT from cease and desist', async () => {
    const signals: CrisisDetectionSignal[] = [
      {
        source: 'message',
        signalType: 'incoming_message',
        confidence: 0.85,
        rawData: { body: 'This is a formal cease and desist notice' },
        timestamp: new Date(),
      },
    ];
    const result = await analyzeSignals(signals);
    expect(result.isCrisis).toBe(true);
    expect(result.type).toBe('LEGAL_THREAT');
  });

  it('should detect PR_ISSUE from multiple negative sentiment signals', async () => {
    const now = new Date();
    const signals: CrisisDetectionSignal[] = [
      {
        source: 'message', signalType: 'negative_sentiment', confidence: 0.8,
        rawData: { contactId: 'contact-1', sentiment: -0.8 },
        timestamp: now,
      },
      {
        source: 'message', signalType: 'negative_sentiment', confidence: 0.7,
        rawData: { contactId: 'contact-2', sentiment: -0.9 },
        timestamp: new Date(now.getTime() + 3600000),
      },
    ];
    const result = await analyzeSignals(signals);
    expect(result.isCrisis).toBe(true);
    expect(result.type).toBe('PR_ISSUE');
  });

  it('should detect HEALTH_EMERGENCY from cancellation + missed check-in pattern', async () => {
    const signals: CrisisDetectionSignal[] = [
      { source: 'calendar', signalType: 'calendar_cancellation', confidence: 0.6, rawData: {}, timestamp: new Date() },
      { source: 'system', signalType: 'missed_checkin', confidence: 0.7, rawData: {}, timestamp: new Date() },
      { source: 'message', signalType: 'incoming_message', confidence: 0.8, rawData: { body: 'Rushed to hospital emergency room' }, timestamp: new Date() },
    ];
    const result = await analyzeSignals(signals);
    expect(result.isCrisis).toBe(true);
    expect(result.type).toBe('HEALTH_EMERGENCY');
    expect(result.severity).toBe('CRITICAL');
  });

  it('should detect FINANCIAL_ANOMALY from unusual transaction patterns', async () => {
    const signals: CrisisDetectionSignal[] = [
      { source: 'financial', signalType: 'transaction', confidence: 0.7, rawData: { amount: 50000 }, timestamp: new Date() },
      { source: 'financial', signalType: 'transaction', confidence: 0.7, rawData: { amount: 30000 }, timestamp: new Date() },
      { source: 'financial', signalType: 'transaction', confidence: 0.7, rawData: { amount: 45000 }, timestamp: new Date() },
    ];
    const result = await analyzeSignals(signals);
    expect(result.isCrisis).toBe(true);
    expect(result.type).toBe('FINANCIAL_ANOMALY');
  });

  it('should detect DATA_BREACH from security-related signals', async () => {
    const signals: CrisisDetectionSignal[] = [
      { source: 'message', signalType: 'incoming_message', confidence: 0.9, rawData: { body: 'We have detected a security breach in the system' }, timestamp: new Date() },
    ];
    const result = await analyzeSignals(signals);
    expect(result.isCrisis).toBe(true);
    expect(result.type).toBe('DATA_BREACH');
  });

  it('should detect CLIENT_COMPLAINT from multiple complaints within 48h', async () => {
    const now = new Date();
    const signals: CrisisDetectionSignal[] = [
      { source: 'message', signalType: 'incoming_message', confidence: 0.7, rawData: { body: 'This is unacceptable service', entityId: 'entity-1' }, timestamp: now },
      { source: 'message', signalType: 'incoming_message', confidence: 0.7, rawData: { body: 'I am filing a formal complaint about this', entityId: 'entity-1' }, timestamp: new Date(now.getTime() + 3600000) },
    ];
    const result = await analyzeSignals(signals);
    expect(result.isCrisis).toBe(true);
    expect(result.type).toBe('CLIENT_COMPLAINT');
  });

  it('should return isCrisis=false when no patterns match', async () => {
    const signals: CrisisDetectionSignal[] = [
      { source: 'message', signalType: 'incoming_message', confidence: 0.5, rawData: { body: 'Hello, how are you today?' }, timestamp: new Date() },
    ];
    const result = await analyzeSignals(signals);
    expect(result.isCrisis).toBe(false);
  });

  it('should assign correct severity based on signal confidence', async () => {
    const highConfSignals: CrisisDetectionSignal[] = [
      { source: 'message', signalType: 'incoming_message', confidence: 0.95, rawData: { body: 'You will receive a subpoena tomorrow' }, timestamp: new Date() },
    ];
    const result = await analyzeSignals(highConfSignals);
    expect(result.isCrisis).toBe(true);
    expect(result.severity).toBe('CRITICAL');
  });

  it('should handle empty signals array', async () => {
    const result = await analyzeSignals([]);
    expect(result.isCrisis).toBe(false);
    expect(result.confidence).toBe(0);
  });
});
