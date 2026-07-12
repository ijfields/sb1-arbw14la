import React, { useState, useCallback, useEffect } from 'react';
import { FileText, AlertCircle, CheckCircle, XCircle, Loader2, MinusCircle, BookOpen, Zap, RefreshCw, Play } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ExecutiveOrder } from '../types';
import { testAIService } from '../services/ai/test';
import type { AIProvider } from '../services/ai/types';
import { supabase } from '../lib/supabase';
import { getPolicyDocuments } from '../services/documentService';
import { queueAssessment, processQueue } from '../services/queueService';

interface AssessmentViewProps {
  executiveOrder: ExecutiveOrder;
}

interface PolicyDocumentOption {
  id: string;
  title: string;
  document_type: string;
  created_at: string;
}

interface StoredAIAssessment {
  provider: 'latimer' | 'perplexity';
  assessment_text: string;
  rating: 'positive' | 'neutral' | 'negative';
  confidence: number;
}

interface StoredImpactAssessment {
  final_rating: 'positive' | 'neutral' | 'negative';
  confidence: number;
  last_updated: string;
}

function isRlsError(message: string): boolean {
  return message.includes('42501') ||
    message.toLowerCase().includes('row-level security') ||
    message.toLowerCase().includes('row level security');
}

const RLS_ERROR_MESSAGE =
  'Database write blocked: apply the assessment write-policies migration ' +
  '(supabase/migrations/20260711000000_assessment_write_policies.sql) in the Supabase SQL editor.';

export function AssessmentView({ executiveOrder }: AssessmentViewProps) {
  const [testingAI, setTestingAI] = useState(false);
  const [testResults, setTestResults] = useState<{
    latimer?: { success: boolean; message?: string; result?: any };
    perplexity?: { success: boolean; message?: string; result?: any };
    deepseek?: { success: boolean; message?: string; result?: any };
    error?: { success: boolean; message?: string; result?: any };
  }>({});
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [, setLastSuccessfulTest] = useState<number | null>(null);

  // Real assessment flow state
  const [documents, setDocuments] = useState<PolicyDocumentOption[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [assessments, setAssessments] = useState<StoredAIAssessment[]>([]);
  const [impact, setImpact] = useState<StoredImpactAssessment | null>(null);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  // Load available policy documents on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const docs = await getPolicyDocuments();
        if (active && docs) {
          // The table holds duplicate uploads per type; getPolicyDocuments
          // orders by created_at desc, so keep only the newest of each type.
          const latestPerType = new Map<string, PolicyDocumentOption>();
          for (const doc of docs as PolicyDocumentOption[]) {
            if (!latestPerType.has(doc.document_type)) {
              latestPerType.set(doc.document_type, doc);
            }
          }
          setDocuments([...latestPerType.values()]);
        }
      } catch (error) {
        console.error('Failed to load policy documents:', error);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Load any stored assessments for the current order + document pair
  const loadStoredAssessments = useCallback(async (orderId: string, docId: string) => {
    if (!orderId || !docId) {
      setAssessments([]);
      setImpact(null);
      return;
    }

    const [aiResult, impactResult] = await Promise.all([
      supabase
        .from('ai_assessments')
        .select('provider, assessment_text, rating, confidence')
        .eq('executive_order_id', orderId)
        .eq('policy_document_id', docId),
      supabase
        .from('impact_assessments')
        .select('final_rating, confidence, last_updated')
        .eq('executive_order_id', orderId)
        .eq('policy_document_id', docId)
        .maybeSingle()
    ]);

    if (aiResult.error) throw aiResult.error;
    if (impactResult.error) throw impactResult.error;

    setAssessments((aiResult.data as StoredAIAssessment[]) || []);
    setImpact((impactResult.data as StoredImpactAssessment) || null);
  }, []);

  // Reset displayed assessments when the executive order changes
  useEffect(() => {
    setAssessments([]);
    setImpact(null);
    setAssessmentError(null);
  }, [executiveOrder.id]);

  // Reload stored assessments whenever the order or selected document changes
  useEffect(() => {
    if (!selectedDocId) return;
    loadStoredAssessments(executiveOrder.id, selectedDocId).catch(error => {
      console.error('Failed to load stored assessments:', error);
    });
  }, [executiveOrder.id, selectedDocId, loadStoredAssessments]);

  const handleRunAssessment = useCallback(async () => {
    if (running || !selectedDocId) return;

    setRunning(true);
    setAssessmentError(null);

    try {
      await queueAssessment(executiveOrder.id, selectedDocId);
      const summary = await processQueue();
      await loadStoredAssessments(executiveOrder.id, selectedDocId);

      // If nothing completed, surface the underlying queue error (e.g. RLS block)
      if (summary.completed === 0 && summary.failed > 0) {
        const { data: failedItems } = await supabase
          .from('assessment_queue')
          .select('error')
          .eq('executive_order_id', executiveOrder.id)
          .eq('policy_document_id', selectedDocId)
          .eq('status', 'failed');

        const failedMessage = failedItems?.find(item => item.error)?.error || '';
        setAssessmentError(
          isRlsError(failedMessage)
            ? RLS_ERROR_MESSAGE
            : failedMessage || 'Assessment failed. Please try again.'
        );
      }
    } catch (error) {
      console.error('Run assessment error:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      setAssessmentError(isRlsError(message) ? RLS_ERROR_MESSAGE : message);
    } finally {
      setRunning(false);
    }
  }, [running, selectedDocId, executiveOrder.id, loadStoredAssessments]);

  const checkConnectionStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/health');
      if (!response.ok) {
        throw new Error('Server connection check failed');
      }
      const data = await response.json();
      return data.status === 'ok';
    } catch (error) {
      console.error('Connection check failed:', error);
      return false;
    }
  }, []);

  const handleTestAI = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (testingAI) return;

    setTestingAI(true);
    setTestResults({}); // Clear previous results

    try {
      const isConnected = await checkConnectionStatus();
      if (!isConnected) {
        setNeedsRefresh(true);
        setTestResults({
          latimer: {
            success: false,
            message: 'Server connection lost. Please refresh the page.'
          }
        });
        setTestingAI(false);
        return;
      }

      // Test providers sequentially to avoid overwhelming the server
      const providers: AIProvider[] = ['latimer', 'perplexity', 'deepseek'];
      const results: Partial<Record<AIProvider, any>> = {};
      let hasError = false;

      for (const provider of providers) {
        try {
          console.log(`Testing ${provider}...`);
          const result = await testAIService(provider);
          results[provider] = result;
          
          // Update results immediately after each test
          setTestResults(prev => ({
            ...prev,
            [provider]: result
          }));

          if (!result.success) {
            // Don't treat disabled DeepSeek as an error
            if (provider === 'deepseek' && result.message?.includes('disabled')) {
              continue;
            }
            hasError = true;
            break;
          }

          // Add a small delay between requests
          if (provider !== providers[providers.length - 1]) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`${provider} test error:`, error);
          const errorMessage = error instanceof Error ? error.message : 'Test failed unexpectedly';
          
          results[provider] = {
            success: false,
            message: errorMessage
          };
          
          if (errorMessage.includes('Server connection lost') || 
              errorMessage.includes('Server returned HTML')) {
            hasError = true;
            setNeedsRefresh(true);
            break;
          }
        }
      }

      if (!hasError) {
        setLastSuccessfulTest(Date.now());
        setNeedsRefresh(false);
      }

    } catch (error) {
      console.error('Test AI error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setTestResults({
        error: {
          success: false,
          message: errorMessage
        }
      });
    } finally {
      setTestingAI(false);
    }
  }, [testingAI, checkConnectionStatus]);

  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <div className="space-y-6">
      {/* Assessment Flow */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <h4 className="font-semibold text-gray-800">Policy Impact Assessment</h4>

        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1">
            <label htmlFor="policy-document" className="block text-sm font-medium text-gray-700 mb-1">
              Policy Document
            </label>
            <select
              id="policy-document"
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              disabled={running}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select a policy document…</option>
              {documents.map(doc => (
                <option key={doc.id} value={doc.id}>
                  {doc.title} ({doc.document_type})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRunAssessment}
            disabled={running || !selectedDocId}
            className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run Assessment
              </>
            )}
          </button>
        </div>

        {assessmentError && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4">
            <div className="flex items-start text-red-700">
              <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0" />
              <p className="text-sm">{assessmentError}</p>
            </div>
          </div>
        )}

        {impact && (
          <div className="flex items-center space-x-2 text-sm bg-gray-50 p-3 rounded">
            <span className="font-medium text-gray-700">Final rating:</span>
            <span className={`capitalize font-medium ${
              impact.final_rating === 'positive' ? 'text-green-600' :
              impact.final_rating === 'negative' ? 'text-red-600' :
              'text-yellow-600'
            }`}>
              {impact.final_rating}
            </span>
            <span className="text-gray-500">
              ({(impact.confidence * 100).toFixed(1)}% confidence)
            </span>
          </div>
        )}

        {assessments.length > 0 && (
          <div className="space-y-4">
            {assessments.map(assessment => (
              <div
                key={assessment.provider}
                className="bg-white p-4 rounded-lg shadow-sm space-y-2 border border-gray-100"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize text-gray-800">{assessment.provider}</span>
                  <div className="flex items-center space-x-4 text-sm">
                    <span className="flex items-center space-x-1">
                      <span className="font-medium">Rating:</span>
                      <span className={`capitalize ${
                        assessment.rating === 'positive' ? 'text-green-600' :
                        assessment.rating === 'negative' ? 'text-red-600' :
                        'text-yellow-600'
                      }`}>
                        {assessment.rating}
                      </span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <span className="font-medium">Confidence:</span>
                      <span>{(assessment.confidence * 100).toFixed(1)}%</span>
                    </span>
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded prose prose-sm max-w-none text-gray-600">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    className="prose prose-sm max-w-none"
                  >
                    {assessment.assessment_text}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Test AI Button */}
      <div className="flex items-center justify-end space-x-2">
        {needsRefresh && (
          <button
            onClick={handleRefresh}
            className="inline-flex items-center px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh Connection
          </button>
        )}
        <button
          onClick={handleTestAI}
          disabled={testingAI}
          className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testingAI ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testing AI...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Test AI Integration
            </>
          )}
        </button>
      </div>

      {/* Test Results */}
      {Object.keys(testResults).length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg space-y-4">
          <h4 className="font-semibold">AI Test Results</h4>
          {needsRefresh && (
            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-amber-600 mr-2" />
                <p className="text-amber-700">
                  The server connection needs to be refreshed. Please click the "Refresh Connection" button above.
                </p>
              </div>
            </div>
          )}
          {Object.entries(testResults).map(([provider, result]) => (
            provider !== 'error' && (
              <div
                key={provider}
                className="bg-white p-4 rounded-lg shadow-sm space-y-2"
              >
                <div className={`flex items-center space-x-2 ${
                  result.success ? 'text-green-600' : 
                  result.message?.includes('disabled') ? 'text-gray-500' :
                  'text-red-600'
                }`}>
                  {result.success ? (
                    <CheckCircle className="w-5 h-5 flex-shrink-0" />
                  ) : result.message?.includes('disabled') ? (
                    <MinusCircle className="w-5 h-5 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-5 h-5 flex-shrink-0" />
                  )}
                  <span className="font-medium capitalize">{provider}:</span>
                  <span className="text-sm">{result.message || (result.success ? 'Test successful' : 'Test failed')}</span>
                </div>

                {result.success && result.result && (
                  <div className="mt-2 text-sm text-gray-600 space-y-2">
                    <div className="bg-gray-50 p-3 rounded prose prose-sm max-w-none">
                      <p className="font-medium text-gray-700 mb-1">Sample Response:</p>
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm]}
                        className="prose prose-sm max-w-none"
                      >
                        {result.result.text}
                      </ReactMarkdown>
                    </div>
                    <div className="flex items-center space-x-4 text-sm">
                      <span className="flex items-center space-x-1">
                        <span className="font-medium">Rating:</span>
                        <span className={`capitalize ${
                          result.result.rating === 'positive' ? 'text-green-600' :
                          result.result.rating === 'negative' ? 'text-red-600' :
                          'text-yellow-600'
                        }`}>
                          {result.result.rating}
                        </span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <span className="font-medium">Confidence:</span>
                        <span>{(result.result.confidence * 100).toFixed(1)}%</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          ))}
          {testResults.error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4">
              <div className="flex items-center text-red-700">
                <AlertCircle className="w-5 h-5 mr-2" />
                <p>{testResults.error.message}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assessment Indicators */}
      <div className="flex items-center justify-center space-x-4 bg-gray-50 p-4 rounded-lg">
        <div className="text-center">
          <div className="mb-2">
            <FileText className="w-8 h-8 mx-auto text-blue-500" />
          </div>
          <p className="text-sm font-medium">Document Analysis</p>
        </div>
        
        <div className="text-center">
          <div className="mb-2">
            <AlertCircle className="w-8 h-8 mx-auto text-yellow-500" />
          </div>
          <p className="text-sm font-medium">Impact Assessment</p>
        </div>
        
        <div className="text-center">
          <div className="mb-2">
            <BookOpen className="w-8 h-8 mx-auto text-green-500" />
          </div>
          <p className="text-sm font-medium">Policy Review</p>
        </div>
      </div>
    </div>
  );
}