import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables in Node.js environment
if (typeof window === 'undefined') {
  dotenv.config();
}

function getEnvVar(name: string): string | undefined {
  console.log(`Attempting to load environment variable: ${name}`);
  
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    const windowEnv = (window as any)?.__env?.[name];
    const viteEnv = (import.meta as any)?.env?.[name];
    
    console.log(`Browser environment check for ${name}:`, {
      windowEnv: windowEnv ? 'Set' : 'Not set',
      viteEnv: viteEnv ? 'Set' : 'Not set',
      isBrowser: true,
      windowExists: typeof window !== 'undefined',
      importMetaExists: typeof import.meta !== 'undefined'
    });
    
    const value = windowEnv || viteEnv;
    console.log(`Final value for ${name}:`, value ? 'Set' : 'Not set');
    return value;
  }
  
  // Node.js environment
  const nodeEnv = process.env[name];
  console.log(`Node environment check for ${name}:`, {
    nodeEnv: nodeEnv ? 'Set' : 'Not set',
    isBrowser: false,
    processExists: typeof process !== 'undefined',
    processEnvExists: typeof process?.env !== 'undefined'
  });
  
  return nodeEnv;
}

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

console.log('Supabase configuration details:', {
  hasUrl: !!supabaseUrl,
  urlValid: supabaseUrl !== 'your-project-url.supabase.co',
  urlLength: supabaseUrl?.length,
  hasKey: !!supabaseAnonKey,
  keyValid: supabaseAnonKey !== 'your-anon-key',
  keyLength: supabaseAnonKey?.length,
  environment: typeof window !== 'undefined' ? 'browser' : 'node'
});

// Create a dummy client for development if no credentials are available
const createDummyClient = () => {
  console.warn('⚠️ Using dummy Supabase client. Please check your environment variables.');
  return {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      delete: () => Promise.resolve({ data: null, error: null }),
    }),
    auth: {
      getSession: () => Promise.resolve(null),
      onAuthStateChange: () => ({ data: null, error: null }),
    },
  };
};

// Create the Supabase client
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
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
    })
  : createDummyClient();

// Test the connection with retries
export async function testConnection(retries = 3): Promise<{ success: boolean; error?: string }> {
  const { isValid, issues } = validateConfig();
  
  if (!isValid) {
    return {
      success: false,
      error: 'Please configure your Supabase connection in the environment variables.'
    };
  }

  console.log('Testing Supabase connection...');
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Connection attempt ${attempt}/${retries}`);
      
      const { error: healthError } = await supabase
        .from('executive_orders')
        .select('count')
        .limit(1)
        .single();
      
      if (healthError) {
        console.error(`Health check failed on attempt ${attempt}:`, healthError);
        if (attempt === retries) {
          throw healthError;
        }
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt - 1), 5000)));
        continue;
      }
      
      return { success: true };
    } catch (error) {
      if (attempt === retries) {
        return { 
          success: false, 
          error: 'Failed to connect to Supabase. Please check your environment variables.'
        };
      }
    }
  }
  
  return {
    success: false,
    error: 'Connection failed after multiple attempts. Please verify your Supabase configuration.'
  };
}

// Add a helper to check environment
export function checkEnvironment() {
  const envStatus = {
    VITE_SUPABASE_URL: supabaseUrl && supabaseUrl !== 'your-project-url.supabase.co' ? 'Set' : 'Missing',
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey && supabaseAnonKey !== 'your-anon-key' ? 'Set' : 'Missing'
  };
  
  console.log('Environment check:', envStatus);
  return envStatus;
}

// Helper to validate the configuration
export function validateConfig() {
  const issues: string[] = [];
  
  if (!supabaseUrl || supabaseUrl === 'your-project-url.supabase.co') {
    issues.push('Missing or invalid VITE_SUPABASE_URL');
  }
  
  if (!supabaseAnonKey || supabaseAnonKey === 'your-anon-key') {
    issues.push('Missing or invalid VITE_SUPABASE_ANON_KEY');
  }
  
  console.log('Configuration validation:', {
    isValid: issues.length === 0,
    issues
  });
  
  return {
    isValid: issues.length === 0,
    issues: issues.length === 0 ? ['No configuration issues found'] : issues
  };
}