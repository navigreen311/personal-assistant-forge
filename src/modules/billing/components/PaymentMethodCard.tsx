'use client';

import type { PaymentMethod } from '@/modules/billing/types';

// --- Props ---

interface PaymentMethodCardProps {
  paymentMethod: PaymentMethod | null;
  loading?: boolean;
  onUpdatePaymentMethod?: () => void;
}

// --- Brand display helpers ---

const brandLabels: Record<string, string> = {
  visa: 'VISA',
  mastercard: 'MC',
  amex: 'AMEX',
  discover: 'DISC',
  diners: 'DIN',
  jcb: 'JCB',
  unionpay: 'UP',
};

const brandColors: Record<string, string> = {
  visa: 'bg-blue-50 border-blue-200 text-blue-700',
  mastercard: 'bg-orange-50 border-orange-200 text-orange-700',
  amex: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  discover: 'bg-amber-50 border-amber-200 text-amber-700',
};

function getBrandDisplay(brand: string): { label: string; colorClass: string } {
  const key = brand.toLowerCase();
  return {
    label: brandLabels[key] ?? brand.toUpperCase(),
    colorClass: brandColors[key] ?? 'bg-gray-100 border-gray-200 text-gray-500',
  };
}

// --- Skeleton ---

function PaymentMethodSkeleton() {
  return (
    <div className="p-5 border border-gray-200 rounded-lg bg-white shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="animate-pulse w-10 h-7 bg-gray-200 rounded" />
          <div className="space-y-1">
            <div className="animate-pulse h-4 w-36 bg-gray-200 rounded" />
            <div className="animate-pulse h-3 w-24 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="animate-pulse h-9 w-40 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}

// --- Component ---

export default function PaymentMethodCard({
  paymentMethod,
  loading,
  onUpdatePaymentMethod,
}: PaymentMethodCardProps) {
  if (loading) {
    return <PaymentMethodSkeleton />;
  }

  const handleUpdate = () => {
    if (onUpdatePaymentMethod) {
      onUpdatePaymentMethod();
    } else {
      window.open('/api/billing/portal', '_blank');
    }
  };

  if (!paymentMethod) {
    return (
      <div className="p-5 border border-gray-200 rounded-lg bg-white shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">No payment method on file</p>
            <p className="text-xs text-gray-500 mt-1">
              Add a payment method to subscribe to a paid plan.
            </p>
          </div>
          <button
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
            onClick={handleUpdate}
          >
            Add Payment Method
          </button>
        </div>
      </div>
    );
  }

  const { label, colorClass } = getBrandDisplay(paymentMethod.brand);
  const expiryStr = `${String(paymentMethod.expiryMonth).padStart(2, '0')}/${paymentMethod.expiryYear}`;

  // Check if card is expiring soon (within 3 months)
  const now = new Date();
  const expiryDate = new Date(paymentMethod.expiryYear, paymentMethod.expiryMonth - 1);
  const monthsUntilExpiry =
    (expiryDate.getFullYear() - now.getFullYear()) * 12 +
    (expiryDate.getMonth() - now.getMonth());
  const isExpiringSoon = monthsUntilExpiry <= 3 && monthsUntilExpiry >= 0;
  const isExpired = monthsUntilExpiry < 0;

  return (
    <div className="p-5 border border-gray-200 rounded-lg bg-white shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-7 border rounded flex items-center justify-center text-xs font-bold ${colorClass}`}
          >
            {label}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              ****&nbsp;&nbsp;****&nbsp;&nbsp;****&nbsp;&nbsp;{paymentMethod.last4}
            </p>
            <p className={`text-xs ${isExpired ? 'text-red-600 font-medium' : isExpiringSoon ? 'text-yellow-600' : 'text-gray-500'}`}>
              {isExpired ? 'Expired' : 'Expires'} {expiryStr}
              {isExpiringSoon && !isExpired && ' — expiring soon'}
            </p>
          </div>
        </div>
        <button
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          onClick={handleUpdate}
        >
          Update Payment Method
        </button>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        Contact support to update payment method if the portal is unavailable.
      </p>
    </div>
  );
}

export { PaymentMethodSkeleton };
