import { AIProvider } from './types';

export async function proxyRequest(
  provider: AIProvider,
  endpoint: string,
  options: RequestInit
): Promise<Response> {
  // Remove any leading slash to prevent double slashes
  const cleanEndpoint = endpoint.replace(/^\//, '');
  
  // Construct the proxy URL correctly
  const proxyUrl = `/api/${provider}/${cleanEndpoint}`;
  
  try {
    console.log(`Making proxy request to ${provider}:`, {
      url: proxyUrl,
      method: options.method,
      hasBody: !!options.body
    });

    // Add retry logic for connection issues
    const maxRetries = 3;
    const retryDelays = [1000, 2000, 4000]; // Exponential backoff
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Check server health before making request
        if (attempt > 0) {
          try {
            const healthCheck = await fetch('/api/health');
            if (!healthCheck.ok) {
              throw new Error('Server health check failed');
            }
          } catch (error) {
            throw new Error('Server connection lost. Please refresh the page.');
          }
        }

        const headers = {
          ...options.headers,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        };

        const response = await fetch(proxyUrl, {
          ...options,
          headers,
          credentials: 'omit',
          mode: 'cors'
        });

        // Check if we got HTML instead of JSON (server error)
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('text/html')) {
          throw new Error('Server returned HTML instead of JSON. Connection may need to be refreshed.');
        }

        if (!response.ok) {
          let errorMessage;
          
          try {
            if (contentType?.includes('application/json')) {
              const error = await response.json();
              // Handle both string and object error messages
              errorMessage = typeof error === 'object' ? 
                error.message || error.error || JSON.stringify(error) :
                error;
            } else {
              errorMessage = await response.text();
              if (errorMessage.includes('<!DOCTYPE html>')) {
                throw new Error('Server connection lost. Please refresh the page.');
              }
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes('Server connection lost')) {
              throw e;
            }
            errorMessage = `${provider} API error: ${response.status}`;
          }

          throw new Error(errorMessage);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Check if we should retry
        if (attempt < maxRetries - 1) {
          const isRetryable = 
            lastError.message.includes('Server connection lost') ||
            lastError.message.includes('Failed to fetch') ||
            lastError.message.includes('Server returned HTML') ||
            lastError.message.includes('socket') ||
            lastError.message.includes('network') ||
            lastError.message.includes('CORS');

          if (isRetryable) {
            console.log(`Retrying request to ${provider} (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
            continue;
          }
        }
        throw lastError;
      }
    }

    throw lastError || new Error('Request failed after retries');
  } catch (error) {
    console.error(`Proxy request to ${provider} failed:`, error);
    
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch') || 
          error.message.includes('socket') ||
          error.message.includes('network') ||
          error.message.includes('CORS')) {
        throw new Error('Network error: Unable to reach the server. Please check your connection.');
      }
      throw error;
    }
    throw new Error('An unexpected error occurred');
  }
}