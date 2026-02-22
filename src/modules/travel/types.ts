export interface TravelPreferences {
  userId: string;
  airlines: { name: string; loyaltyNumber?: string; seatPreference: string; class: string }[];
  hotels: { chain: string; loyaltyNumber?: string; roomType: string }[];
  dietary: string[];
  budgetPerDayUsd: number;
  preferredAirports: string[];
  travelDocuments: TravelDocument[];
}

export interface TravelDocument {
  type: 'PASSPORT' | 'VISA' | 'GLOBAL_ENTRY' | 'TSA_PRECHECK' | 'DRIVERS_LICENSE';
  number: string;
  expirationDate: Date;
  issuingCountry: string;
  isExpiringSoon: boolean;
}

export interface Itinerary {
  id: string;
  userId: string;
  name: string;
  status: 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  legs: ItineraryLeg[];
  totalCostEstimate: number;
  currency: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItineraryLeg {
  id: string;
  order: number;
  type: 'FLIGHT' | 'HOTEL' | 'CAR_RENTAL' | 'TRAIN' | 'TRANSFER' | 'ACTIVITY';
  departureLocation: string;
  arrivalLocation: string;
  departureTime: Date;
  arrivalTime: Date;
  timezone: string;
  confirmationNumber?: string;
  provider?: string;
  costUsd: number;
  status: 'BOOKED' | 'PENDING' | 'CANCELLED' | 'COMPLETED';
  notes?: string;
}

export interface FlightAlert {
  itineraryId: string;
  legId: string;
  alertType: 'DELAY' | 'CANCELLATION' | 'GATE_CHANGE' | 'BOOKING_PRICE_DROP';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  originalValue?: string;
  newValue?: string;
  timestamp: Date;
}

export interface DisruptionResponse {
  originalLeg: ItineraryLeg;
  alternatives: ItineraryLeg[];
  recommendation: ItineraryLeg;
  reason: string;
  additionalCost: number;
}

export interface TimezoneAdjustment {
  eventId: string;
  eventTitle: string;
  originalTimezone: string;
  travelTimezone: string;
  originalTime: Date;
  adjustedTime: Date;
  conflictDetected: boolean;
}

export interface VisaRequirement {
  destinationCountry: string;
  citizenshipCountry: string;
  visaRequired: boolean;
  visaType?: string;
  processingDays?: number;
  documentRequired: string[];
  notes: string;
}

export interface LoyaltyProgram {
  id: string;
  userId: string;
  programName: string;
  accountNumber: string;
  tier: string;
  balance: number;
  unit: 'miles' | 'points';
  expiringAmount?: number;
  expiringDate?: Date;
  estimatedValue: number;
}
