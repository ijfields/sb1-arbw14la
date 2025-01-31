import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Initializing Supabase with:', {
  hasUrl: !!supabaseUrl,
  hasKey: !!supabaseAnonKey,
  url: supabaseUrl?.substring(0, 10) + '...' // Log partial URL for debugging
});

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please ensure you have connected to Supabase.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'X-Client-Info': 'executive-policy-tracker'
    }
  }
});

// Test the connection with retries
export async function testConnection(retries = 3): Promise<{ success: boolean; error?: string }> {
  console.log('Testing Supabase connection...');
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Connection attempt ${attempt}/${retries}`);
      
      // First test basic connectivity
      const { data: healthCheck, error: healthError } = await supabase
        .from('executive_orders')
        .select('count')
        .limit(1)
        .single();
      
      if (healthError) {
        console.error(`Health check failed on attempt ${attempt}:`, healthError);
        if (attempt === retries) {
          throw healthError;
        }
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
        continue;
      }
      
      console.log('Supabase connection test successful');
      return { success: true };
    } catch (error) {
      console.error(`Connection attempt ${attempt} failed with error:`, error);
      
      // Check for specific error types
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('not found') || message.includes('does not exist')) {
          return { 
            success: false, 
            error: 'Database tables not found. Please ensure you have connected to Supabase and run the migrations.'
          };
        }
        
        if (message.includes('permission denied')) {
          return {
            success: false,
            error: 'Permission denied. Please check your Supabase connection and ensure proper access rights.'
          };
        }
        
        if (message.includes('network') || message.includes('failed to fetch')) {
          if (attempt === retries) {
            return {
              success: false,
              error: 'Network error. Please check your internet connection and try again.'
            };
          }
          continue;
        }
      }
      
      if (attempt === retries) {
        return { 
          success: false, 
          error: error instanceof Error 
            ? error.message 
            : 'Failed to connect to database. Please ensure you have connected to Supabase.'
        };
      }
    }
  }
  
  return {
    success: false,
    error: 'Failed to establish database connection after multiple attempts. Please try again.'
  };
}

// Add a helper to check environment
export function checkEnvironment() {
  const envStatus = {
    VITE_SUPABASE_URL: supabaseUrl ? 'Set' : 'Missing',
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey ? 'Set' : 'Missing'
  };
  
  console.log('Environment check:', envStatus);
  
  return envStatus;
}

// Add a helper to validate the connection configuration
export function validateConfig() {
  const issues: string[] = [];
  
  if (!supabaseUrl) {
    issues.push('Missing VITE_SUPABASE_URL');
  } else if (!supabaseUrl.startsWith('https://')) {
    issues.push('Invalid VITE_SUPABASE_URL format');
  }
  
  if (!supabaseAnonKey) {
    issues.push('Missing VITE_SUPABASE_ANON_KEY');
  } else if (!supabaseAnonKey.startsWith('eyJ')) {
    issues.push('Invalid VITE_SUPABASE_ANON_KEY format');
  }
  
  return {
    isValid: issues.length === 0,
    issues
  };
}

// Add a helper to handle common Supabase errors
export function handleSupabaseError(error: unknown): string {
  if (!error) return 'An unknown error occurred';
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'The requested resource was not found. Please ensure you have connected to Supabase and run the migrations.';
    }
    
    if (message.includes('permission denied')) {
      return 'Permission denied. Please check your Supabase connection and ensure proper access rights.';
    }
    
    if (message.includes('network') || message.includes('failed to fetch')) {
      return 'Network error. Please check your internet connection and try again.';
    }
    
    if (message.includes('timeout')) {
      return 'The request timed out. Please try again.';
    }
    
    return error.message;
  }
  
  return 'An unexpected error occurred. Please try again.';
}