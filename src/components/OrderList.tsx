import React from 'react';
import { FileText, AlertCircle } from 'lucide-react';
import type { ExecutiveOrder } from '../types';

interface OrderListProps {
  orders: ExecutiveOrder[];
  onOrderSelect: (order: ExecutiveOrder) => void;
  selectedOrder: ExecutiveOrder | null;
}

export function OrderList({ orders, onOrderSelect, selectedOrder }: OrderListProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="space-y-4">
      {orders.map((order) => (
        <div
          key={order.id}
          className={`bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow cursor-pointer ${
            selectedOrder?.id === order.id ? 'ring-2 ring-blue-500' : ''
          }`}
          onClick={() => onOrderSelect(order)}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3">
              <FileText className="w-5 h-5 text-blue-600 mt-1" />
              <div>
                <h3 className="font-semibold text-lg">{order.title}</h3>
                <p className="text-sm text-gray-600">Executive Order {order.number}</p>
                <p className="text-sm text-gray-500 mt-1">{formatDate(order.date)}</p>
              </div>
            </div>
            {order.status !== 'active' && (
              <div className="flex items-center space-x-1 text-amber-600">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm capitalize">{order.status}</span>
              </div>
            )}
          </div>
          <p className="mt-2 text-gray-700 line-clamp-2">{order.summary}</p>
        </div>
      ))}
    </div>
  );
}