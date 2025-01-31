import React from 'react';
import { AlertCircle } from 'lucide-react';
import type { ExecutiveOrder, PolicyProposal } from '../types';
import { AssessmentView } from './AssessmentView';

interface ComparisonViewProps {
  order: ExecutiveOrder | null;
  relatedProposals: PolicyProposal[];
}

export function ComparisonView({ order, relatedProposals }: ComparisonViewProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (!order) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 text-center h-[calc(100vh-12rem)] flex items-center justify-center">
        <p className="text-gray-600">Select an executive order to view details</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 min-h-[calc(100vh-12rem)] flex flex-col">
      <div className="border-b pb-4 mb-6">
        <h2 className="text-2xl font-bold mb-2">{order.title}</h2>
        <p className="text-gray-600">Executive Order {order.number}</p>
        <p className="text-gray-500 text-sm mt-1">
          Signed on {formatDate(order.date)}
        </p>
        
        {order.status !== 'active' && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mt-4">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-amber-600 mr-2" />
              <p className="text-amber-700">
                This executive order has been {order.status.toLowerCase()}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex-grow">
        <AssessmentView executiveOrder={order} />
      </div>
    </div>
  );
}