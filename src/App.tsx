import React, { useState, useEffect, useMemo } from 'react';
import { Header } from './components/Header';
import { OrderList } from './components/OrderList';
import { ComparisonView } from './components/ComparisonView';
import { SearchBar } from './components/SearchBar';
import { Pagination } from './components/Pagination';
import { DocumentUpload } from './components/DocumentUpload';
import type { ExecutiveOrder } from './types';
import { AlertCircle, RefreshCw, Database } from 'lucide-react';
import { supabase, testConnection, validateConfig, checkEnvironment } from './lib/supabase';
import { syncOrders } from './services/orderSync';
import { ErrorBoundary } from './components/ErrorBoundary';

const ITEMS_PER_PAGE = 10;

function App() {
  const [orders, setOrders] = useState<ExecutiveOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ExecutiveOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');

  const checkConnection = async () => {
    console.log('Starting connection check process...');
    
    // First validate the configuration
    const { isValid, issues } = validateConfig();
    if (!isValid) {
      console.error('Configuration validation failed:', issues);
      setConnectionStatus('error');
      setError(`Invalid configuration: ${issues.join(', ')}`);
      return;
    }
    
    // Check environment variables
    const envStatus = checkEnvironment();
    if (!envStatus.VITE_SUPABASE_URL || !envStatus.VITE_SUPABASE_ANON_KEY) {
      console.error('Missing environment variables:', envStatus);
      setConnectionStatus('error');
      setError('Missing Supabase configuration. Please click the "Connect to Supabase" button in the top right corner.');
      return;
    }

    console.log('Configuration validated, testing connection...');
    const { success, error: connectionError } = await testConnection();
    
    if (success) {
      console.log('Connection successful, loading orders...');
      setConnectionStatus('connected');
      loadExecutiveOrders();
    } else {
      console.error('Connection failed:', connectionError);
      setConnectionStatus('error');
      setError(connectionError || 'Failed to connect to database. Please ensure you are connected to Supabase.');
    }
  };

  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return orders;

    const query = searchQuery.toLowerCase();
    return orders.filter(order => 
      order.title.toLowerCase().includes(query) ||
      order.number.toLowerCase().includes(query) ||
      order.summary.toLowerCase().includes(query)
    );
  }, [orders, searchQuery]);

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  const loadExecutiveOrders = async () => {
    try {
      console.log('Starting to load executive orders...');
      setLoading(true);
      
      const { data, error: fetchError } = await supabase
        .from('executive_orders')
        .select('*')
        .order('signing_date', { ascending: false });

      if (fetchError) {
        console.error('Error fetching orders:', fetchError);
        throw fetchError;
      }

      console.log('Raw orders data:', data);

      if (!data || data.length === 0) {
        console.log('No orders found, initiating sync...');
        await handleSync();
        return;
      }

      const transformedOrders = data.map(order => {
        console.log('Transforming order:', order.id);
        return {
          id: order.id,
          number: order.number,
          title: order.title,
          date: order.signing_date || order.publication_date || new Date().toISOString(),
          summary: order.summary || 'No summary available',
          category: order.category || 'Uncategorized',
          status: order.status === 'verified' ? 'active' : (order.status as 'active' | 'revoked' | 'superseded'),
          url: order.whitehouse_url || order.federal_register_url || '',
          document_number: order.federal_register_id,
          pdf_url: order.pdf_url
        };
      });

      console.log('Transformed orders:', transformedOrders.length);
      setOrders(transformedOrders);
      setError(null);
      
    } catch (err) {
      console.error('Error in loadExecutiveOrders:', err);
      setError(err instanceof Error ? err.message : 'Failed to load executive orders');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      console.log('Starting sync...');
      await syncOrders();
      await loadExecutiveOrders();
      setCurrentPage(1);
      console.log('Sync completed');
    } catch (err) {
      console.error('Error syncing orders:', err);
      setError('Failed to sync orders. Please try again later.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  if (connectionStatus === 'checking') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Database className="w-8 h-8 animate-pulse text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600">Connecting to database...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (connectionStatus === 'error') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto">
            <div className="flex items-center justify-center text-red-600 mb-4">
              <AlertCircle className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-bold text-center mb-4">Connection Error</h2>
            <p className="text-gray-600 text-center mb-6">{error}</p>
            <div className="text-center">
              <button
                onClick={checkConnection}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry Connection
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-4 text-center">
              If the problem persists, please click the "Connect to Supabase" button in the top right corner.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
              <p className="text-gray-600">Loading executive orders...</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ErrorBoundary>
        <Header />
        
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            {/* Left Column - Order List */}
            <div className="xl:col-span-5">
              <ErrorBoundary>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">Executive Orders</h2>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setShowUpload(!showUpload)}
                        className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                      >
                        {showUpload ? 'Hide Upload' : 'Upload Document'}
                      </button>
                      <button
                        onClick={handleSync}
                        disabled={syncing}
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Syncing...' : 'Sync Orders'}
                      </button>
                    </div>
                  </div>

                  {showUpload && (
                    <DocumentUpload
                      onUploadComplete={() => {
                        setShowUpload(false);
                      }}
                    />
                  )}

                  <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    onClear={() => setSearchQuery('')}
                  />
                </div>

                {error ? (
                  <div className="bg-white rounded-lg shadow-lg p-6 text-center text-red-600 mt-4">
                    <div className="flex items-center justify-center space-x-2">
                      <AlertCircle className="w-5 h-5" />
                      <p>{error}</p>
                    </div>
                    <button
                      onClick={handleSync}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Try Again
                    </button>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="bg-white rounded-lg shadow-lg p-6 mt-4">
                    <div className="flex items-center space-x-2 text-amber-600 mb-4">
                      <AlertCircle className="w-5 h-5" />
                      <p>No executive orders found</p>
                    </div>
                    <p className="text-gray-600">
                      {searchQuery ? 'Try adjusting your search terms.' : 'Click the "Sync Orders" button above to fetch the latest executive orders.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <OrderList 
                      orders={paginatedOrders}
                      onOrderSelect={setSelectedOrder}
                      selectedOrder={selectedOrder}
                    />
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setCurrentPage}
                    />
                  </>
                )}
              </ErrorBoundary>
            </div>
            
            {/* Right Column - Comparison View */}
            <div className="xl:col-span-7">
              <ErrorBoundary>
                <ComparisonView 
                  order={selectedOrder}
                  relatedProposals={[]}
                />
              </ErrorBoundary>
            </div>
          </div>
        </main>
      </ErrorBoundary>
    </div>
  );
}

export default App;