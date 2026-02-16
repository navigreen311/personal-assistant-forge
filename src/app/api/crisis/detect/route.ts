import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as detectionService from '@/modules/crisis/services/detection-service';

const detectSchema = z.object({
  signals: z.array(z.object({
    source: z.string(),
    signalType: z.string(),
    confidence: z.number().min(0).max(1),
    rawData: z.record(z.string(), z.unknown()),
    timestamp: z.string().transform(s => new Date(s)),
  })),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = detectSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const result = await detectionService.analyzeSignals(parsed.data.signals);
    return success(result);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
