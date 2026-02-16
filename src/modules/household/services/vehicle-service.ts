import { v4 as uuidv4 } from 'uuid';
import { addDays, isBefore, isAfter } from 'date-fns';
import type { VehicleRecord } from '../types';

const vehicleStore = new Map<string, VehicleRecord>();

export async function addVehicle(
  userId: string,
  vehicle: Omit<VehicleRecord, 'id' | 'maintenanceHistory'>
): Promise<VehicleRecord> {
  const newVehicle: VehicleRecord = {
    ...vehicle,
    id: uuidv4(),
    userId,
    maintenanceHistory: [],
  };
  vehicleStore.set(newVehicle.id, newVehicle);
  return newVehicle;
}

export async function getVehicles(userId: string): Promise<VehicleRecord[]> {
  return Array.from(vehicleStore.values()).filter(v => v.userId === userId);
}

export async function logMaintenance(
  vehicleId: string,
  entry: { date: Date; type: string; cost: number; mileage: number; provider: string }
): Promise<VehicleRecord> {
  const vehicle = vehicleStore.get(vehicleId);
  if (!vehicle) throw new Error(`Vehicle ${vehicleId} not found`);

  vehicle.maintenanceHistory.push(entry);
  vehicle.mileage = entry.mileage;
  vehicleStore.set(vehicleId, vehicle);
  return vehicle;
}

export async function getUpcomingService(userId: string): Promise<VehicleRecord[]> {
  const now = new Date();
  const thirtyDays = addDays(now, 30);
  return Array.from(vehicleStore.values()).filter(v => {
    if (v.userId !== userId || !v.nextServiceDate) return false;
    const serviceDate = new Date(v.nextServiceDate);
    return isBefore(serviceDate, thirtyDays);
  });
}

export async function checkExpiringDocuments(
  userId: string
): Promise<{ vehicleId: string; type: string; expiryDate: Date }[]> {
  const now = new Date();
  const thirtyDays = addDays(now, 30);
  const expiring: { vehicleId: string; type: string; expiryDate: Date }[] = [];

  for (const vehicle of Array.from(vehicleStore.values())) {
    if (vehicle.userId !== userId) continue;

    if (vehicle.insuranceExpiry) {
      const expiry = new Date(vehicle.insuranceExpiry);
      if (isAfter(expiry, now) && isBefore(expiry, thirtyDays)) {
        expiring.push({ vehicleId: vehicle.id, type: 'insurance', expiryDate: expiry });
      }
    }

    if (vehicle.registrationExpiry) {
      const expiry = new Date(vehicle.registrationExpiry);
      if (isAfter(expiry, now) && isBefore(expiry, thirtyDays)) {
        expiring.push({ vehicleId: vehicle.id, type: 'registration', expiryDate: expiry });
      }
    }
  }

  return expiring;
}
