'use client';

import { useState } from 'react';

interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface Props {
  entityId: string;
  onSubmit: (data: {
    entityId: string;
    lineItems: LineItem[];
    tax: number;
    currency: string;
    status: string;
    issuedDate: string;
    dueDate: string;
    notes: string;
    paymentTerms: string;
  }) => void;
  onCancel?: () => void;
}

export default function InvoiceForm({ entityId, onSubmit, onCancel }: Props) {
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unitPrice: 0 },
  ]);
  const [tax, setTax] = useState(0);
  const [currency] = useState('USD');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const total = subtotal + tax;

  const addLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unitPrice: 0 }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      entityId,
      lineItems,
      tax,
      currency,
      status: 'DRAFT',
      issuedDate: new Date().toISOString(),
      dueDate: new Date(dueDate).toISOString(),
      notes,
      paymentTerms,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-medium text-gray-700">Line Items</h3>
        {lineItems.map((item, index) => (
          <div key={index} className="mb-2 flex gap-2">
            <input
              type="text"
              placeholder="Description"
              value={item.description}
              onChange={(e) => updateLineItem(index, 'description', e.target.value)}
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              required
            />
            <input
              type="number"
              placeholder="Qty"
              value={item.quantity}
              onChange={(e) => updateLineItem(index, 'quantity', Number(e.target.value))}
              className="w-20 rounded border border-gray-300 px-3 py-2 text-sm"
              min="1"
              required
            />
            <input
              type="number"
              placeholder="Price"
              value={item.unitPrice}
              onChange={(e) => updateLineItem(index, 'unitPrice', Number(e.target.value))}
              className="w-28 rounded border border-gray-300 px-3 py-2 text-sm"
              min="0"
              step="0.01"
              required
            />
            <span className="flex w-24 items-center justify-end text-sm font-medium">
              ${(item.quantity * item.unitPrice).toFixed(2)}
            </span>
            {lineItems.length > 1 && (
              <button
                type="button"
                onClick={() => removeLineItem(index)}
                className="text-red-500 hover:text-red-700"
              >
                X
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addLineItem}
          className="mt-2 text-sm text-blue-600 hover:text-blue-800"
        >
          + Add line item
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm text-gray-600">Tax Amount</label>
          <input
            type="number"
            value={tax}
            onChange={(e) => setTax(Number(e.target.value))}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            min="0"
            step="0.01"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-600">Payment Terms</label>
        <select
          value={paymentTerms}
          onChange={(e) => setPaymentTerms(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option>Due on receipt</option>
          <option>Net 15</option>
          <option>Net 30</option>
          <option>Net 45</option>
          <option>Net 60</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-gray-600">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          rows={3}
        />
      </div>

      <div className="border-t border-gray-200 pt-4">
        <div className="flex justify-between text-sm">
          <span>Subtotal</span>
          <span className="font-medium">${subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span>Tax</span>
          <span className="font-medium">${tax.toFixed(2)}</span>
        </div>
        <div className="mt-2 flex justify-between border-t pt-2 text-lg font-bold">
          <span>Total</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Create Invoice
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
