import type { TravelDocument, VisaRequirement } from '../types';
import { getPreferences } from './preferences-service';
import { addMonths, isBefore } from 'date-fns';

// Built-in visa requirement lookup table
const visaLookup: Record<string, VisaRequirement> = {
  'US->CA': { destinationCountry: 'CA', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Canada for up to 6 months without a visa.' },
  'US->MX': { destinationCountry: 'MX', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Mexico for up to 180 days without a visa.' },
  'US->GB': { destinationCountry: 'GB', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit the UK for up to 6 months without a visa.' },
  'US->EU': { destinationCountry: 'EU', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Schengen Area for up to 90 days within 180 days. ETIAS authorization may be required.' },
  'US->JP': { destinationCountry: 'JP', citizenshipCountry: 'US', visaRequired: false, documentRequired: ['PASSPORT'], notes: 'US citizens can visit Japan for up to 90 days without a visa for tourism.' },
  'US->AU': { destinationCountry: 'AU', citizenshipCountry: 'US', visaRequired: true, visaType: 'ETA (Electronic Travel Authority)', processingDays: 1, documentRequired: ['PASSPORT'], notes: 'US citizens need an ETA which can be obtained online.' },
  'US->BR': { destinationCountry: 'BR', citizenshipCountry: 'US', visaRequired: true, visaType: 'e-Visa', processingDays: 5, documentRequired: ['PASSPORT', 'PHOTO', 'PROOF_OF_TRAVEL'], notes: 'US citizens need an e-Visa for Brazil.' },
  'US->CN': { destinationCountry: 'CN', citizenshipCountry: 'US', visaRequired: true, visaType: 'Tourist Visa (L)', processingDays: 10, documentRequired: ['PASSPORT', 'PHOTO', 'INVITATION_LETTER', 'PROOF_OF_TRAVEL', 'BANK_STATEMENT'], notes: 'US citizens need a visa for China. Apply at Chinese embassy or consulate.' },
  'US->IN': { destinationCountry: 'IN', citizenshipCountry: 'US', visaRequired: true, visaType: 'e-Tourist Visa', processingDays: 3, documentRequired: ['PASSPORT', 'PHOTO', 'PROOF_OF_TRAVEL'], notes: 'US citizens can obtain an e-Tourist Visa online for stays up to 90 days.' },
};

export async function checkVisaRequirements(
  citizenshipCountry: string,
  destinationCountry: string
): Promise<VisaRequirement> {
  const key = `${citizenshipCountry}->${destinationCountry}`;
  const result = visaLookup[key];

  if (result) return result;

  // Generic fallback
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
