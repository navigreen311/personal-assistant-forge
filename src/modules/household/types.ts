export interface MaintenanceTask {
  id: string;
  userId: string;
  category: 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'LAWN' | 'APPLIANCE' | 'ROOF' | 'PEST' | 'GENERAL';
  title: string;
  description?: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL' | 'ONE_TIME';
  season?: 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER' | 'ANY';
  lastCompletedDate?: Date;
  nextDueDate: Date;
  assignedProviderId?: string;
  estimatedCostUsd?: number;
  status: 'UPCOMING' | 'OVERDUE' | 'COMPLETED' | 'SKIPPED';
  notes?: string;
}

export interface ServiceProvider {
  id: string;
  userId: string;
  name: string;
  category: string;
  phone?: string;
  email?: string;
  rating: number;
  lastUsed?: Date;
  notes?: string;
  costHistory: { date: Date; amount: number; service: string }[];
}

export interface ShoppingItem {
  id: string;
  userId: string;
  name: string;
  category: string;
  quantity: number;
  unit?: string;
  store?: string;
  estimatedPrice?: number;
  isPurchased: boolean;
  isRecurring: boolean;
  recurringFrequency?: string;
  addedAt: Date;
}

export interface WarrantyRecord {
  id: string;
  userId: string;
  itemName: string;
  purchaseDate: Date;
  warrantyEndDate: Date;
  provider: string;
  receiptUrl?: string;
  claimPhone?: string;
  isExpiring: boolean;
  isExpired: boolean;
  notes?: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  name: string;
  costPerMonth: number;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  renewalDate: Date;
  category: string;
  isActive: boolean;
  autoRenew: boolean;
  cancellationUrl?: string;
}

export interface VehicleRecord {
  id: string;
  userId: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  mileage: number;
  nextServiceDate?: Date;
  nextServiceType?: string;
  insuranceExpiry?: Date;
  registrationExpiry?: Date;
  maintenanceHistory: { date: Date; type: string; cost: number; mileage: number; provider: string }[];
}

export interface FamilyMember {
  id: string;
  userId: string;
  name: string;
  relationship: string;
  email?: string;
  phone?: string;
  visibility: 'FULL' | 'LIMITED' | 'NONE';
  sharedCalendar: boolean;
  sharedTasks: boolean;
  sharedShopping: boolean;
}
