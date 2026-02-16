'use client';

import type { VehicleRecord } from '../types';

export default function VehicleDashboard({ vehicles }: { vehicles: VehicleRecord[] }) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Vehicles</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {vehicles.map(vehicle => {
          const now = new Date();
          const insuranceExpiring = vehicle.insuranceExpiry && new Date(vehicle.insuranceExpiry).getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000;
          const regExpiring = vehicle.registrationExpiry && new Date(vehicle.registrationExpiry).getTime() - now.getTime() < 30 * 24 * 60 * 60 * 1000;

          return (
            <div key={vehicle.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold">{vehicle.year} {vehicle.make} {vehicle.model}</div>
                  {vehicle.vin && <div className="text-xs text-gray-400">VIN: {vehicle.vin}</div>}
                </div>
                <div className="text-sm text-gray-600">{vehicle.mileage.toLocaleString()} mi</div>
              </div>
              <div className="mt-3 space-y-1 text-sm">
                {vehicle.nextServiceDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Next Service</span>
                    <span>{new Date(vehicle.nextServiceDate).toLocaleDateString()} - {vehicle.nextServiceType ?? 'General'}</span>
                  </div>
                )}
                {vehicle.insuranceExpiry && (
                  <div className={`flex justify-between ${insuranceExpiring ? 'text-red-600 font-medium' : ''}`}>
                    <span className={insuranceExpiring ? '' : 'text-gray-500'}>Insurance</span>
                    <span>{new Date(vehicle.insuranceExpiry).toLocaleDateString()}{insuranceExpiring ? ' ⚠' : ''}</span>
                  </div>
                )}
                {vehicle.registrationExpiry && (
                  <div className={`flex justify-between ${regExpiring ? 'text-red-600 font-medium' : ''}`}>
                    <span className={regExpiring ? '' : 'text-gray-500'}>Registration</span>
                    <span>{new Date(vehicle.registrationExpiry).toLocaleDateString()}{regExpiring ? ' ⚠' : ''}</span>
                  </div>
                )}
              </div>
              {vehicle.maintenanceHistory.length > 0 && (
                <div className="mt-3 border-t pt-2">
                  <div className="text-xs text-gray-500">Recent Service</div>
                  <div className="text-sm">
                    {vehicle.maintenanceHistory[vehicle.maintenanceHistory.length - 1].type} - ${vehicle.maintenanceHistory[vehicle.maintenanceHistory.length - 1].cost}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
