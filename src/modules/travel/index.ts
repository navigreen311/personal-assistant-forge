// Services
export {
  checkFlightStatus,
  generateDisruptionResponse,
  getActiveAlerts,
} from './services/flight-monitor-service';
export {
  calculateTotalCost,
  optimizeItinerary,
  createItinerary,
  getItinerary,
  listItineraries,
  updateLeg,
  addLeg,
  removeLeg,
} from './services/itinerary-service';
export {
  getPreferences,
  updatePreferences,
  checkDocumentExpiry,
} from './services/preferences-service';
export {
  adjustScheduleForTravel,
  detectTimezoneConflicts,
  getTimezoneAdvice,
  estimateJetLag,
  findOptimalMeetingTime,
} from './services/timezone-service';
export {
  checkVisaRequirements,
  validateTravelDocuments,
} from './services/visa-checker-service';

// Types
export type {
  TravelPreferences,
  TravelDocument,
  Itinerary,
  ItineraryLeg,
  FlightAlert,
  DisruptionResponse,
  TimezoneAdjustment,
  VisaRequirement,
  LoyaltyProgram,
} from './types';
