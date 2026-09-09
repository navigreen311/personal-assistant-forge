import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const generateSchema = z.object({
  propertyId: z.string().min(1),
  // Optional and still verified; see the tenancy pattern, section 1.
  entityId: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Standard seasonal template
//
// This is a fixed list of common home-maintenance chores, NOT an analysis of the
// property. It does not read the property's age, systems, appliances or history,
// and every property gets the same twelve tasks and the same $1,650 estimate.
//
// That is fine as a starting checklist and it is not invented measurement -- but
// it was previously named `generateMockSchedule` and returned under a route
// called `generate-schedule`, which reads as though something was computed for
// this property specifically. Renamed and documented so the caller knows what it
// is getting. Making it property-specific needs the property's systems on the
// schema, which is frozen.
// ---------------------------------------------------------------------------

interface ScheduleTask {
  title: string;
  description: string;
  category: string;
  frequency: string;
  estimatedCostUsd: number;
}

interface SeasonalSchedule {
  propertyId: string;
  /** True for every response: this is a fixed checklist, not a per-property plan. */
  isStandardTemplate: true;
  generatedAt: string;
  seasons: {
    spring: ScheduleTask[];
    summer: ScheduleTask[];
    fall: ScheduleTask[];
    winter: ScheduleTask[];
  };
  annualEstimate: number;
}

function standardSeasonalTemplate(propertyId: string): SeasonalSchedule {
  return {
    propertyId,
    isStandardTemplate: true,
    generatedAt: new Date().toISOString(),
    seasons: {
      spring: [
        {
          title: 'HVAC Spring Service',
          description: 'Schedule professional AC tune-up before summer heat. Replace air filters, check refrigerant levels, clean condenser coils.',
          category: 'HVAC',
          frequency: 'ANNUAL',
          estimatedCostUsd: 150,
        },
        {
          title: 'Sprinkler System Start-up',
          description: 'Activate irrigation system, check for broken heads or leaks, adjust zones for spring watering schedule.',
          category: 'LAWN',
          frequency: 'ANNUAL',
          estimatedCostUsd: 75,
        },
        {
          title: 'Exterior Inspection',
          description: 'Walk property perimeter checking for winter damage to siding, trim, and foundation. Look for cracks or settling.',
          category: 'GENERAL',
          frequency: 'ANNUAL',
          estimatedCostUsd: 0,
        },
      ],
      summer: [
        {
          title: 'AC Filter Replacement',
          description: 'Replace HVAC air filters monthly during peak cooling season for optimal efficiency.',
          category: 'HVAC',
          frequency: 'MONTHLY',
          estimatedCostUsd: 15,
        },
        {
          title: 'Pest Control Treatment',
          description: 'Schedule quarterly pest control service. Focus on ants, scorpions, and other desert pests.',
          category: 'PEST',
          frequency: 'QUARTERLY',
          estimatedCostUsd: 85,
        },
        {
          title: 'Pool Maintenance Check',
          description: 'If applicable: verify chemical balance, clean filters, inspect pump equipment.',
          category: 'GENERAL',
          frequency: 'MONTHLY',
          estimatedCostUsd: 120,
        },
      ],
      fall: [
        {
          title: 'Furnace Pre-Season Inspection',
          description: 'Professional heating system inspection before winter. Check heat exchanger, pilot light, and thermostat calibration.',
          category: 'HVAC',
          frequency: 'ANNUAL',
          estimatedCostUsd: 125,
        },
        {
          title: 'Gutter Cleaning',
          description: 'Clear gutters and downspouts of debris. Check for proper drainage away from foundation.',
          category: 'ROOF',
          frequency: 'BIANNUAL',
          estimatedCostUsd: 150,
        },
        {
          title: 'Winterize Irrigation',
          description: 'Blow out sprinkler lines, shut off exterior water supply, insulate exposed pipes.',
          category: 'PLUMBING',
          frequency: 'ANNUAL',
          estimatedCostUsd: 85,
        },
      ],
      winter: [
        {
          title: 'Water Heater Flush',
          description: 'Drain and flush water heater to remove sediment buildup. Check anode rod condition.',
          category: 'PLUMBING',
          frequency: 'ANNUAL',
          estimatedCostUsd: 0,
        },
        {
          title: 'Smoke & CO Detector Check',
          description: 'Test all smoke and carbon monoxide detectors. Replace batteries and any units older than 10 years.',
          category: 'ELECTRICAL',
          frequency: 'BIANNUAL',
          estimatedCostUsd: 30,
        },
        {
          title: 'Appliance Deep Clean',
          description: 'Deep clean refrigerator coils, oven, dishwasher, and washer/dryer. Check hoses for wear.',
          category: 'APPLIANCE',
          frequency: 'ANNUAL',
          estimatedCostUsd: 0,
        },
      ],
    },
    annualEstimate: 1650,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = generateSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      // The property is a row, so its owner is a property of the row -- prove the
      // caller's entity owns it before answering about it. Select the id only:
      // no property data crosses this line.
      const property = await prisma.document.findFirst({
        where: {
          id: parsed.data.propertyId,
          entityId,
          type: 'PROPERTY',
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!property) return error('NOT_FOUND', 'Property not found', 404);

      const schedule = standardSeasonalTemplate(property.id);
      return success(schedule);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
