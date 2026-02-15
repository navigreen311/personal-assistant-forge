import { v4 as uuidv4 } from 'uuid';
import type { ToneTrainingSample } from '../types';

const sampleStore = new Map<string, ToneTrainingSample>();

const sampleTemplates: { text: string; context: string }[] = [
  { text: 'Hi Team, I wanted to follow up on the project timeline. Could you provide an update by EOD?', context: 'Internal team follow-up' },
  { text: 'Thank you for your proposal. We have reviewed it carefully and would like to proceed with the next steps.', context: 'Client communication' },
  { text: 'I appreciate your patience on this matter. We are working to resolve it as quickly as possible.', context: 'Customer support response' },
  { text: 'Please find attached the quarterly report for your review. Let me know if you have any questions.', context: 'Formal report delivery' },
  { text: 'Hey! Just checking in on how things are going with the new feature. Any blockers?', context: 'Casual team check-in' },
];

export async function generateSample(userId: string, context: string): Promise<ToneTrainingSample> {
  const template = sampleTemplates[Math.floor(Math.random() * sampleTemplates.length)];
  const sample: ToneTrainingSample = {
    id: uuidv4(),
    userId,
    sampleText: template.text,
    context: context || template.context,
    userRating: 0,
    adjustments: [],
  };
  sampleStore.set(sample.id, sample);
  return sample;
}

export async function rateSample(
  sampleId: string,
  rating: number,
  adjustments?: string[]
): Promise<ToneTrainingSample> {
  const sample = sampleStore.get(sampleId);
  if (!sample) throw new Error(`Sample ${sampleId} not found`);

  sample.userRating = rating;
  if (adjustments) sample.adjustments = adjustments;
  sampleStore.set(sampleId, sample);
  return sample;
}

export async function getSamples(userId: string): Promise<ToneTrainingSample[]> {
  const samples: ToneTrainingSample[] = [];
  for (const sample of sampleStore.values()) {
    if (sample.userId === userId) samples.push(sample);
  }
  return samples;
}

export async function applyTraining(userId: string): Promise<{ toneProfile: Record<string, unknown> }> {
  const samples = await getSamples(userId);
  const rated = samples.filter((s) => s.userRating > 0);

  const avgRating = rated.length > 0
    ? rated.reduce((sum, s) => sum + s.userRating, 0) / rated.length
    : 3;

  const allAdjustments = rated.flatMap((s) => s.adjustments);
  const adjustmentCounts = new Map<string, number>();
  for (const adj of allAdjustments) {
    adjustmentCounts.set(adj, (adjustmentCounts.get(adj) || 0) + 1);
  }

  return {
    toneProfile: {
      averageRating: avgRating,
      samplesRated: rated.length,
      topAdjustments: Array.from(adjustmentCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([adj]) => adj),
      formality: avgRating >= 4 ? 'formal' : avgRating >= 3 ? 'balanced' : 'casual',
    },
  };
}

export { sampleStore };
