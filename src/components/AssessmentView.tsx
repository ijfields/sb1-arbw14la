import React, { useState, useCallback } from 'react';
import { FileText, AlertCircle, CheckCircle, XCircle, Loader2, MinusCircle, ExternalLink, BookOpen, X, Zap, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ExecutiveOrder } from '../types';
import { supabase } from '../lib/supabase';
import { getPolicyDocumentPDF } from '../services/documentService';
import { testAIService } from '../services/ai/test';
import type { AIProvider } from '../services/ai/types';
import { assessExecutiveOrder, type PolicyType } from '../services/assessmentService';

interface AssessmentViewProps {
  executiveOrder: ExecutiveOrder;
}

export function AssessmentView({ executiveOrder }: AssessmentViewProps) {
  const [selectedPolicy, setSelectedPolicy] = useState<PolicyType>('project2025');
  const [isAssessing, setIsAssessing] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<{
    text: string;
    rating: 'positive' | 'neutral' | 'negative';
    confidence: number;
    tokenUsage?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePolicyChange = (policy: PolicyType) => {
    setSelectedPolicy(policy);
    setAssessmentResult(null);
    setError(null);
  };

  const handleTestAssessment = async (isDevelopment: boolean = true) => {
    setIsAssessing(true);
    setError(null);
    
    try {
      const result = await assessExecutiveOrder(
        executiveOrder.id,
        selectedPolicy,
        isDevelopment
      );
      
      setAssessmentResult(result);
    } catch (err) {
      console.error('Assessment error:', err);
      setError(err instanceof Error ? err.message : 'Assessment failed');
    } finally {
      setIsAssessing(false);
    }
  };

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'positive':
        return 'text-green-600';
      case 'negative':
        return 'text-red-600';
      default:
        return 'text-yellow-600';
    }
  };

  return (
    <div className="space-y-6">
      {/* Policy Selection */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Policy Assessment</h3>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Select Policy Document
          </label>
          <select
            value={selectedPolicy}
            onChange={(e) => handlePolicyChange(e.target.value as PolicyType)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            disabled={isAssessing}
          >
            <option value="project2025">Project 2025</option>
            <option value="agenda47">Agenda 47</option>
            <option value="attack_on_power">Attack on our Power</option>
            <option value="peoples_response">People's Response</option>
            <option value="contract_black_america">Contract with Black America</option>
            <option value="harris_economic_plan">Harris's Economic Plan for Black Men</option>
          </select>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* Test Buttons */}
      <div className="flex space-x-4">
        <button
          onClick={() => handleTestAssessment(true)}
          disabled={isAssessing}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isAssessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Assessing...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-2" />
              Test Assessment (Dev)
            </>
          )}
        </button>
        <button
          onClick={() => handleTestAssessment(false)}
          disabled={isAssessing}
          className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
        >
          {isAssessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Assessing...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4 mr-2" />
              Test Assessment (Prod)
            </>
          )}
        </button>
      </div>

      {/* Assessment Results */}
      {assessmentResult && (
        <div className="bg-white p-4 rounded-lg shadow-sm space-y-4">
          <div className={`flex items-center space-x-2 ${getRatingColor(assessmentResult.rating)}`}>
            {assessmentResult.rating === 'positive' && <CheckCircle className="w-5 h-5" />}
            {assessmentResult.rating === 'negative' && <XCircle className="w-5 h-5" />}
            {assessmentResult.rating === 'neutral' && <MinusCircle className="w-5 h-5" />}
            <span className="font-medium capitalize">{assessmentResult.rating} Alignment</span>
            <span className="text-sm">({(assessmentResult.confidence * 100).toFixed(1)}% confidence)</span>
          </div>
          {assessmentResult.tokenUsage && (
            <div className="text-sm text-gray-500">
              Token usage: {assessmentResult.tokenUsage} tokens
            </div>
          )}
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {assessmentResult.text}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}