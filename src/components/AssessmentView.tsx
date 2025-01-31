import React, { useState, useCallback } from 'react';
import { FileText, AlertCircle, CheckCircle, XCircle, Loader2, MinusCircle, ExternalLink, BookOpen, X, Zap, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ExecutiveOrder } from '../types';
import { supabase } from '../lib/supabase';
import { getPolicyDocumentPDF } from '../services/documentService';
import { testAIService } from '../services/ai/test';
import type { AIProvider } from '../services/ai/types';

interface AssessmentViewProps {
  executiveOrder: ExecutiveOrder;
}

export function AssessmentView({ executiveOrder }: AssessmentViewProps) {
  const [testingAI, setTestingAI] = useState(false);
  const [testResults, setTestResults] = useState<{
    latimer?: { success: boolean; message?: string; result?: any };
    perplexity?: { success: boolean; message?: string; result?: any };
    deepseek?: { success: boolean; message?: string; result?: any };
  }>({});
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [lastSuccessfulTest, setLastSuccessfulTest] = useState<number | null>(null);

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
      const results: Record<AIProvider, any> = {};
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