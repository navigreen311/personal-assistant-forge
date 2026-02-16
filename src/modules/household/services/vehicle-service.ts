import { addDays, isBefore, isAfter } from 'date-fns';
import { prisma } from '@/lib/db';
import type { VehicleRecord } from '../types';

function docToVehicle(doc: {
  id: string;
  entityId: string;
  content: string | null;
}): VehicleRecord {
  const data = doc.content ? JSON.parse(doc.content) : {};
  return {
    id: doc.id,
    userId: doc.entityId,
    make: data.make ?? '',
    model: data.model ?? '',
    year: data.year ?? 0,
    vin: data.vin,
    mileage: data.mileage ?? 0,
    nextServiceDate: data.nextServiceDate ? new Date(data.nextServiceDate) : undefined,
    nextServiceType: data.nextServiceType,
    insuranceExpiry: data.insuranceExpiry ? new Date(data.insuranceExpiry) : undefined,
    registrationExpiry: data.registrationExpiry ? new Date(data.registrationExpiry) : undefined,
    maintenanceHistory: (data.maintenanceHistory ?? []).map((e: { date: string; type: string; cost: number; mileage: number; provider: string }) => ({
      ...e,
      date: new Date(e.date),
    })),
  };
}

function vehicleToContent(vehicle: Omit<VehicleRecord, 'id'>): string {
  return JSON.stringify({
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    vin: vehicle.vin,
    mileage: vehicle.mileage,
    nextServiceDate: vehicle.nextServiceDate ? new Date(vehicle.nextServiceDate).toISOString() : null,
    nextServiceType: vehicle.nextServiceType,
    insuranceExpiry: vehicle.insuranceExpiry ? new Date(vehicle.insuranceExpiry).toISOString() : null,
    registrationExpiry: vehicle.registrationExpiry ? new Date(vehicle.registrationExpiry).toISOString() : null,
    maintenanceHistory: vehicle.maintenanceHistory.map(e => ({
      ...e,
      date: new Date(e.date).toISOString(),
    })),
  });
}

export async function addVehicle(
  userId: string,
  vehicle: Omit<VehicleRecord, 'id' | 'maintenanceHistory'>
): Promise<VehicleRecord> {
  const created = await prisma.document.create({
    data: {
      title: `${vehicle.make} ${vehicle.model} ${vehicle.year}`,
      entityId: userId,
      type: 'VEHICLE',
      status: 'ACTIVE',
      content: vehicleToContent({ ...vehicle, maintenanceHistory: [] }),
    },
  });

  return docToVehicle(created);
}

export async function getVehicles(userId: string): Promise<VehicleRecord[]> {
  const docs = await prisma.document.findMany({
    where: {
      entityId: userId,
      type: 'VEHICLE',
      deletedAt: null,
    },
  });

  return docs.map(docToVehicle);
}

export async function logMaintenance(
  vehicleId: string,
  entry: { date: Date; type: string; cost: number; mileage: number; provider: string }
): Promise<VehicleRecord> {
  const existing = await prisma.document.findUnique({ where: { id: vehicleId } });
  if (!existing) throw new Error(`Vehicle ${vehicleId} not found`);

  const data = existing.content ? JSON.parse(existing.content) : {};
  const history = data.maintenanceHistory ?? [];
  history.push({
    date: entry.date.toISOString(),
    type: entry.type,
    cost: entry.cost,
    mileage: entry.mileage,
    provider: entry.provider,
  });

  data.maintenanceHistory = history;
  data.mileage = entry.mileage;

  const updated = await prisma.document.update({
    where: { id: vehicleId },
    data: {
      content: JSON.stringify(data),
    },
  });

  return docToVehicle(updated);
}

export async function getUpcomingService(userId: string): Promise<VehicleRecord[]> {
  const now = new Date();
  const thirtyDays = addDays(now, 30);
  const vehicles = await getVehicles(userId);

  return vehicles.filter(v => {
    if (!v.nextServiceDate) return false;
    const serviceDate = new Date(v.nextServiceDate);
    return isBefore(serviceDate, thirtyDays);
  });
}

export async function checkExpiringDocuments(
  userId: string
): Promise<{ vehicleId: string; type: string; expiryDate: Date }[]> {
  const now = new Date();
  const thirtyDays = addDays(now, 30);
  const vehicles = await getVehicles(userId);
  const expiring: { vehicleId: string; type: string; expiryDate: Date }[] = [];

  for (const vehicle of vehicles) {
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
