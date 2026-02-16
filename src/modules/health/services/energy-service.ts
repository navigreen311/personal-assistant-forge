import { generateJSON } from '@/lib/ai';
import type { EnergyForecast } from '../types';
import { getSleepHistory } from './sleep-service';

export async function forecastEnergy(userId: string, date: string): Promise<EnergyForecast> {
  const recentSleep = await getSleepHistory(userId, 3);
  const avgScore = recentSleep.length > 0
    ? recentSleep.reduce((sum, d) => sum + d.sleepScore, 0) / recentSleep.length
    : 70;

  const baseEnergy = avgScore / 100;

  // Model circadian rhythm: peaks at 10am and 3pm, troughs at 2pm and after 9pm
  const hourlyEnergy: { hour: number; energyLevel: number; confidence: number }[] = [];
  for (let hour = 0; hour < 24; hour++) {
    let level: number;

    if (hour >= 6 && hour <= 9) {
      // Morning ramp up
      level = baseEnergy * (0.5 + (hour - 6) * 0.125);
    } else if (hour >= 10 && hour <= 12) {
      // Morning peak
      level = baseEnergy * 0.95;
    } else if (hour >= 13 && hour <= 14) {
      // Post-lunch dip
      level = baseEnergy * 0.6;
    } else if (hour >= 15 && hour <= 17) {
      // Afternoon peak
      level = baseEnergy * 0.85;
    } else if (hour >= 18 && hour <= 21) {
      // Evening wind down
      level = baseEnergy * (0.7 - (hour - 18) * 0.1);
    } else {
      // Night / early morning
      level = baseEnergy * 0.2;
    }

    // Add some noise
    level = Math.max(0, Math.min(1, level + (Math.random() - 0.5) * 0.1));

    hourlyEnergy.push({
      hour,
      energyLevel: Math.round(level * 100),
      confidence: Math.round((0.7 + Math.random() * 0.3) * 100) / 100,
    });
  }

  const peakHours = hourlyEnergy
    .filter(h => h.energyLevel >= 75)
    .map(h => h.hour);

  const troughHours = hourlyEnergy
    .filter(h => h.hour >= 6 && h.hour <= 22 && h.energyLevel < 50)
    .map(h => h.hour);

  // Use AI to generate personalized recommendation
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

  // Use AI to generate intelligent slot recommendations
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
    // Fallback to rule-based slot assignment
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
