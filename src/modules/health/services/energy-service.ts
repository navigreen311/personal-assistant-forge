import { subDays } from 'date-fns';
import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';
import type { EnergyForecast } from '../types';

// Deterministic perturbation based on hour and date
function deterministicPerturbation(hour: number, dateStr: string): number {
  let dateHash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    dateHash = (dateHash * 31 + dateStr.charCodeAt(i)) | 0;
  }
  return Math.sin(hour * 0.7 + dateHash) * 0.05;
}

export async function forecastEnergy(userId: string, date: string): Promise<EnergyForecast> {
  // Query recent sleep data from DB
  const recentSleep = await prisma.healthMetric.findMany({
    where: {
      entityId: userId,
      type: 'sleep',
      recordedAt: { gte: subDays(new Date(), 3) },
    },
    orderBy: { recordedAt: 'desc' },
    take: 3,
  });

  // Query historical energy patterns
  const historicalEnergy = await prisma.healthMetric.findMany({
    where: {
      entityId: userId,
      type: 'energy',
      recordedAt: { gte: subDays(new Date(), 7) },
    },
    orderBy: { recordedAt: 'desc' },
  });

  // Calculate base energy from sleep quality
  let avgScore = 70; // default if no data
  if (recentSleep.length > 0) {
    avgScore = recentSleep.reduce((sum: number, d: { value: number }) => sum + d.value, 0) / recentSleep.length;
    // Normalize: sleep value is totalHours, convert to a 0-100 score
    // 8 hours = score 100, scale linearly
    avgScore = Math.min(100, (avgScore / 8) * 100);
  }

  // If we have historical energy data, blend it in
  if (historicalEnergy.length > 0) {
    const avgHistorical = historicalEnergy.reduce((sum: number, d: { value: number }) => sum + d.value, 0) / historicalEnergy.length;
    avgScore = avgScore * 0.7 + avgHistorical * 0.3;
  }

  const baseEnergy = avgScore / 100;

  // Model circadian rhythm with deterministic perturbation
  const hourlyEnergy: { hour: number; energyLevel: number; confidence: number }[] = [];
  for (let hour = 0; hour < 24; hour++) {
    let level: number;

    if (hour >= 6 && hour <= 9) {
      level = baseEnergy * (0.5 + (hour - 6) * 0.125);
    } else if (hour >= 10 && hour <= 12) {
      level = baseEnergy * 0.95;
    } else if (hour >= 13 && hour <= 14) {
      level = baseEnergy * 0.6;
    } else if (hour >= 15 && hour <= 17) {
      level = baseEnergy * 0.85;
    } else if (hour >= 18 && hour <= 21) {
      level = baseEnergy * (0.7 - (hour - 18) * 0.1);
    } else {
      level = baseEnergy * 0.2;
    }

    // Deterministic perturbation instead of Math.random()
    const perturbation = deterministicPerturbation(hour, date);
    level = Math.max(0, Math.min(1, level + perturbation));

    // Confidence based on data availability
    const dataConfidence = recentSleep.length > 0 ? 0.8 : 0.5;
    const hourConfidence = (hour >= 8 && hour <= 20) ? dataConfidence + 0.1 : dataConfidence - 0.1;

    hourlyEnergy.push({
      hour,
      energyLevel: Math.round(level * 100),
      confidence: Math.round(Math.max(0.3, Math.min(1, hourConfidence)) * 100) / 100,
    });
  }

  const peakHours = hourlyEnergy
    .filter(h => h.energyLevel >= 75)
    .map(h => h.hour);

  const troughHours = hourlyEnergy
    .filter(h => h.hour >= 6 && h.hour <= 22 && h.energyLevel < 50)
    .map(h => h.hour);

  let recommendation: string;
  try {
    const aiResult = await generateJSON<{ recommendation: string; peakHours: number[]; troughHours: number[] }>(
      `Based on this energy forecast data, provide a personalized recommendation.

Average recent sleep score: ${Math.round(avgScore)}
Peak energy hours: ${peakHours.join(', ')} (energy >= 75)
Low energy hours: ${troughHours.join(', ')} (energy < 50)
Date: ${date}

Return a JSON object with:
- "recommendation": a concise, actionable recommendation (1-2 sentences) for optimizing the day
- "peakHours": confirmed peak hours array
- "troughHours": confirmed trough hours array`,
      {
        temperature: 0.5,
        system: 'You are an energy management expert. Provide concise, practical recommendations for optimizing daily energy and productivity.',
      }
    );

    recommendation = aiResult.recommendation;
  } catch {
    recommendation = peakHours.length > 0
      ? `Schedule deep work during peak hours (${peakHours.join(', ')}:00). Take breaks during energy troughs.`
      : 'Consider improving sleep quality to boost overall energy levels.';
  }

  return {
    userId,
    date,
    hourlyEnergy,
    peakHours,
    troughHours,
    recommendation,
  };
}

export async function getOptimalSchedule(
  userId: string,
  date: string
): Promise<{ deepWorkSlots: string[]; meetingSlots: string[]; breakSlots: string[] }> {
  const forecast = await forecastEnergy(userId, date);

  try {
    const energySummary = forecast.hourlyEnergy
      .filter(h => h.hour >= 7 && h.hour <= 21)
      .map(h => ({ hour: h.hour, energy: h.energyLevel }));

    const aiResult = await generateJSON<{ deepWorkSlots: string[]; meetingSlots: string[]; breakSlots: string[] }>(
      `Based on this hourly energy forecast, recommend optimal time slots for different activities.

Energy levels (7am-9pm): ${JSON.stringify(energySummary)}

Return a JSON object with:
- "deepWorkSlots": array of time strings (HH:00) for high-focus deep work (highest energy hours)
- "meetingSlots": array of time strings for meetings and collaborative work (moderate energy)
- "breakSlots": array of time strings for breaks and light tasks (low energy hours)

Use 24-hour format with zero-padded hours (e.g. "07:00", "14:00").`,
      {
        temperature: 0.4,
        system: 'You are a productivity optimization expert. Assign time slots based on energy levels: deep work for peak energy, meetings for moderate, breaks for low energy.',
      }
    );

    return {
      deepWorkSlots: aiResult.deepWorkSlots ?? [],
      meetingSlots: aiResult.meetingSlots ?? [],
      breakSlots: aiResult.breakSlots ?? [],
    };
  } catch {
    const deepWorkSlots: string[] = [];
    const meetingSlots: string[] = [];
    const breakSlots: string[] = [];

    for (const entry of forecast.hourlyEnergy) {
      if (entry.hour < 7 || entry.hour > 21) continue;

      const timeStr = `${String(entry.hour).padStart(2, '0')}:00`;

      if (entry.energyLevel >= 75) {
        deepWorkSlots.push(timeStr);
      } else if (entry.energyLevel >= 50) {
        meetingSlots.push(timeStr);
      } else {
        breakSlots.push(timeStr);
      }
    }

    return { deepWorkSlots, meetingSlots, breakSlots };
  }
}
