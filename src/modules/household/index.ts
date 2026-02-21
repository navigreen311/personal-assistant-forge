// Services
export {
  addMember,
  getMembers,
  updateMemberPrivacy,
  getSharedItems,
} from './services/family-service';
export {
  createTask,
  getUpcomingTasks,
  getOverdueTasks,
  completeTask,
  getSeasonalSchedule,
  generateAnnualSchedule,
} from './services/maintenance-service';
export {
  addProvider,
  getProviders,
  updateProvider,
  logServiceCall,
  getRecommendedProvider,
} from './services/provider-service';
export {
  addItem,
  getList,
  markPurchased,
  getSmartSuggestions,
  groupByStore,
} from './services/shopping-service';
export {
  addVehicle,
  getVehicles,
  logMaintenance,
  getUpcomingService,
  checkExpiringDocuments,
} from './services/vehicle-service';
export {
  addWarranty,
  getWarranties,
  getExpiringWarranties,
  addSubscription,
  getSubscriptions,
  getMonthlySubscriptionCost,
  getUpcomingRenewals,
} from './services/warranty-service';

// Types
export type {
  MaintenanceTask,
  ServiceProvider,
  ShoppingItem,
  WarrantyRecord,
  SubscriptionRecord,
  VehicleRecord,
  FamilyMember,
} from './types';
