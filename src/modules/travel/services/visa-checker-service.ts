import type { TravelDocument, VisaRequirement } from '../types';
import { generateJSON } from '@/lib/ai';
import { getPreferences } from './preferences-service';
import { addMonths, isBefore } from 'date-fns';

// Built-in visa requirement lookup table (30+ country pairs)
const visaLookup: Record<string, VisaRequirement> = {
  // US outbound
  'US->CA': { destinationCountry: 'CA', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Canada for up to 6 months without a visa.' },
  'US->MX': { destinationCountry: 'MX', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Mexico for up to 180 days without a visa.' },
  'US->GB': { destinationCountry: 'GB', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit the UK for up to 6 months without a visa.' },
  'US->EU': { destinationCountry: 'EU', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Schengen Area for up to 90 days within 180 days. ETIAS authorization may be required.' },
  'US->JP': { destinationCountry: 'JP', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Japan for up to 90 days without a visa for tourism.' },
  'US->AU': { destinationCountry: 'AU', citizenshipCountry: 'US', visaRequired: true, visaType: 'ETA (Electronic Travel Authority)', processingDays: 1, documentRequired: ['PASSPORT'], notes: 'US citizens need an ETA which can be obtained online.' },
  'US->BR': { destinationCountry: 'BR', citizenshipCountry: 'US', visaRequired: true, visaType: 'e-Visa', processingDays: 5, documentRequired: ['PASSPORT', 'PHOTO', 'PROOF_OF_TRAVEL'], notes: 'US citizens need an e-Visa for Brazil.' },
  'US->CN': { destinationCountry: 'CN', citizenshipCountry: 'US', visaRequired: true, visaType: 'Tourist Visa (L)', processingDays: 10, documentRequired: ['PASSPORT', 'PHOTO', 'INVITATION_LETTER', 'PROOF_OF_TRAVEL', 'BANK_STATEMENT'], notes: 'US citizens need a visa for China. Apply at Chinese embassy or consulate.' },
  'US->IN': { destinationCountry: 'IN', citizenshipCountry: 'US', visaRequired: true, visaType: 'e-Tourist Visa', processingDays: 3, documentRequired: ['PASSPORT', 'PHOTO', 'PROOF_OF_TRAVEL'], notes: 'US citizens can obtain an e-Tourist Visa online for stays up to 90 days.' },
  'US->KR': { destinationCountry: 'KR', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit South Korea for up to 90 days without a visa. K-ETA may be required.' },
  'US->TH': { destinationCountry: 'TH', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Thailand for up to 30 days without a visa (extendable to 60 days).' },
  'US->SG': { destinationCountry: 'SG', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Singapore for up to 90 days without a visa.' },
  'US->DE': { destinationCountry: 'DE', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Germany for up to 90 days within 180 days under Schengen rules.' },
  'US->FR': { destinationCountry: 'FR', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit France for up to 90 days within 180 days under Schengen rules.' },
  'US->IT': { destinationCountry: 'IT', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Italy for up to 90 days within 180 days under Schengen rules.' },
  'US->ES': { destinationCountry: 'ES', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Spain for up to 90 days within 180 days under Schengen rules.' },
  'US->AE': { destinationCountry: 'AE', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens receive a visa on arrival for up to 30 days in the UAE.' },
  'US->IL': { destinationCountry: 'IL', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Israel for up to 90 days without a visa.' },
  'US->NZ': { destinationCountry: 'NZ', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit New Zealand for up to 90 days without a visa. NZeTA required.' },
  'US->CO': { destinationCountry: 'CO', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Colombia for up to 90 days without a visa.' },
  'US->AR': { destinationCountry: 'AR', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Argentina for up to 90 days without a visa.' },
  'US->ZA': { destinationCountry: 'ZA', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit South Africa for up to 90 days without a visa.' },
  // Inbound to US
  'CA->US': { destinationCountry: 'US', citizenshipCountry: 'CA', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'Canadian citizens can visit the US for up to 6 months without a visa.' },
  'GB->US': { destinationCountry: 'US', citizenshipCountry: 'GB', visaRequired: false, visaType: 'ESTA (Visa Waiver Program)', processingDays: 1, documentRequired: ['PASSPORT', 'ESTA'], notes: 'UK citizens can visit the US under the Visa Waiver Program with an approved ESTA for up to 90 days.' },
  'AU->US': { destinationCountry: 'US', citizenshipCountry: 'AU', visaRequired: false, visaType: 'ESTA (Visa Waiver Program)', processingDays: 1, documentRequired: ['PASSPORT', 'ESTA'], notes: 'Australian citizens can visit the US under the Visa Waiver Program with an approved ESTA for up to 90 days.' },
  'JP->US': { destinationCountry: 'US', citizenshipCountry: 'JP', visaRequired: false, visaType: 'ESTA (Visa Waiver Program)', processingDays: 1, documentRequired: ['PASSPORT', 'ESTA'], notes: 'Japanese citizens can visit the US under the Visa Waiver Program with an approved ESTA for up to 90 days.' },
  'DE->US': { destinationCountry: 'US', citizenshipCountry: 'DE', visaRequired: false, visaType: 'ESTA (Visa Waiver Program)', processingDays: 1, documentRequired: ['PASSPORT', 'ESTA'], notes: 'German citizens can visit the US under the Visa Waiver Program with an approved ESTA for up to 90 days.' },
  'IN->US': { destinationCountry: 'US', citizenshipCountry: 'IN', visaRequired: true, visaType: 'B-1/B-2 Visitor Visa', processingDays: 30, documentRequired: ['PASSPORT', 'PHOTO', 'DS-160', 'PROOF_OF_FUNDS', 'PROOF_OF_TIES'], notes: 'Indian citizens need a B-1/B-2 visa for the US. Interview at US embassy required.' },
  'BR->US': { destinationCountry: 'US', citizenshipCountry: 'BR', visaRequired: true, visaType: 'B-1/B-2 Visitor Visa', processingDays: 30, documentRequired: ['PASSPORT', 'PHOTO', 'DS-160', 'PROOF_OF_FUNDS'], notes: 'Brazilian citizens need a B-1/B-2 visa for the US. Interview at US embassy required.' },
  'CN->US': { destinationCountry: 'US', citizenshipCountry: 'CN', visaRequired: true, visaType: 'B-1/B-2 Visitor Visa', processingDays: 30, documentRequired: ['PASSPORT', 'PHOTO', 'DS-160', 'PROOF_OF_FUNDS', 'PROOF_OF_TIES'], notes: 'Chinese citizens need a B-1/B-2 visa for the US. Interview at US embassy required.' },
};

export async function checkVisaRequirements(
  citizenshipCountry: string,
  destinationCountry: string
): Promise<VisaRequirement> {
  const key = `${citizenshipCountry}->${destinationCountry}`;
  const result = visaLookup[key];

  if (result) return result;

  // AI-powered fallback for unknown country pairs
  try {
    const aiResult = await generateJSON<VisaRequirement>(
      `What are the visa requirements for a citizen of ${citizenshipCountry} traveling to ${destinationCountry}?

Return a JSON object with these exact fields:
- "destinationCountry": "${destinationCountry}"
- "citizenshipCountry": "${citizenshipCountry}"
- "visaRequired": boolean (when unsure, default to true)
- "visaType": string or null (e.g. "Tourist Visa", "e-Visa")
- "processingDays": number or null (estimated processing time)
- "documentRequired": string[] (e.g. ["PASSPORT", "PHOTO", "PROOF_OF_TRAVEL"])
- "notes": string (brief summary of requirements and any important caveats)`,
      {
        temperature: 0.3,
        system: 'You are a travel visa requirements expert. Be conservative: when unsure whether a visa is required, say it IS required. Always recommend checking with the official embassy or consulate for the most current information. Include this caveat in the notes field.',
      }
    );

    return {
      destinationCountry,
      citizenshipCountry,
      visaRequired: aiResult.visaRequired ?? true,
      visaType: aiResult.visaType ?? 'Tourist Visa',
      processingDays: aiResult.processingDays ?? 14,
      documentRequired: aiResult.documentRequired ?? ['PASSPORT', 'PHOTO', 'PROOF_OF_TRAVEL'],
      notes: aiResult.notes ?? `AI-generated: Visa requirements for ${citizenshipCountry} citizens traveling to ${destinationCountry}. Verify with the embassy.`,
    };
  } catch {
    // Fallback if AI fails
    return {
      destinationCountry,
      citizenshipCountry,
      visaRequired: true,
      visaType: 'Tourist Visa',
      processingDays: 14,
      documentRequired: ['PASSPORT', 'PHOTO', 'PROOF_OF_TRAVEL'],
      notes: `Visa requirements for ${citizenshipCountry} citizens traveling to ${destinationCountry} vary. Check with the destination country's embassy for current requirements.`,
    };
  }
}

export async function validateTravelDocuments(
  userId: string,
  destinationCountry: string
): Promise<{ ready: boolean; missing: string[]; expiring: TravelDocument[] }> {
  const prefs = await getPreferences(userId);
  const sixMonthsFromNow = addMonths(new Date(), 6);

  // Check which documents the user has
  const userDocTypes = prefs.travelDocuments.map(d => d.type);

  // Always need a passport for international travel
  const missing: string[] = [];
  if (!userDocTypes.includes('PASSPORT')) {
    missing.push('PASSPORT');
  }

  // Check visa requirements
  const visaReq = await checkVisaRequirements('US', destinationCountry);
  if (visaReq.visaRequired && !userDocTypes.includes('VISA')) {
    missing.push('VISA');
  }

  // Check expiring documents
  const expiring = prefs.travelDocuments
    .map(doc => ({
      ...doc,
      isExpiringSoon: isBefore(new Date(doc.expirationDate), sixMonthsFromNow),
    }))
    .filter(doc => doc.isExpiringSoon);

  return {
    ready: missing.length === 0 && expiring.length === 0,
    missing,
    expiring,
  };
}
