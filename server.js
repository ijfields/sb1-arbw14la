import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const port = process.env.PORT || 3000;

// Get the directory name of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));

// Middleware setup
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));

// Serve static files from the dist directory if it exists
const distPath = join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// API routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// In-memory cache for executive order full text, keyed by document number.
// Simple size cap with oldest-eviction to bound memory usage.
const EO_FULLTEXT_CACHE = new Map();
const EO_FULLTEXT_CACHE_MAX = 100;

const cacheFullText = (documentNumber, text) => {
  // Evict oldest entries until we're under the cap (Map preserves insertion order)
  while (EO_FULLTEXT_CACHE.size >= EO_FULLTEXT_CACHE_MAX) {
    const oldestKey = EO_FULLTEXT_CACHE.keys().next().value;
    EO_FULLTEXT_CACHE.delete(oldestKey);
  }
  EO_FULLTEXT_CACHE.set(documentNumber, text);
};

// Fetch the full text of an executive order (or any Federal Register document)
// by its document number. The .txt endpoint has no CORS headers, so the browser
// cannot fetch it directly — this route proxies and cleans it.
// IMPORTANT: registered before the dev catch-all app.get('*') below.
app.get('/api/eo-fulltext/:documentNumber', async (req, res) => {
  const { documentNumber } = req.params;

  // Validate against a safe pattern to avoid SSRF / path surprises
  if (!/^[A-Za-z0-9._-]+$/.test(documentNumber)) {
    return res.status(400).json({ message: 'Invalid document number' });
  }

  // Serve from cache when available
  if (EO_FULLTEXT_CACHE.has(documentNumber)) {
    console.log(`EO full text cache hit for ${documentNumber}`);
    return res.json({ text: EO_FULLTEXT_CACHE.get(documentNumber) });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    console.log(`Fetching EO full text metadata for ${documentNumber}`);

    // Step 1: look up the raw_text_url for this document
    const metaUrl = `https://www.federalregister.gov/api/v1/documents/${documentNumber}.json?fields[]=raw_text_url`;
    const metaResponse = await fetch(metaUrl, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    if (!metaResponse.ok) {
      clearTimeout(timeout);
      console.error(`Federal Register metadata error for ${documentNumber}:`, metaResponse.status);
      return res.status(metaResponse.status === 404 ? 404 : 502).json({
        message: `Federal Register API error (status ${metaResponse.status})`
      });
    }

    const meta = await metaResponse.json();
    const rawTextUrl = meta?.raw_text_url;

    if (!rawTextUrl) {
      clearTimeout(timeout);
      return res.status(404).json({ message: 'No raw text available for this document' });
    }

    // Defense against redirect surprises: only fetch from the expected host
    let parsedUrl;
    try {
      parsedUrl = new URL(rawTextUrl);
    } catch (e) {
      clearTimeout(timeout);
      return res.status(502).json({ message: 'Invalid raw text URL returned by Federal Register' });
    }

    if (parsedUrl.host !== 'www.federalregister.gov') {
      clearTimeout(timeout);
      console.error(`Unexpected raw text host for ${documentNumber}:`, parsedUrl.host);
      return res.status(502).json({ message: 'Unexpected raw text host' });
    }

    // Step 2: fetch the raw text
    console.log(`Fetching EO raw text for ${documentNumber} from ${rawTextUrl}`);
    const textResponse = await fetch(rawTextUrl, { signal: controller.signal });

    clearTimeout(timeout);

    if (!textResponse.ok) {
      console.error(`Federal Register raw text error for ${documentNumber}:`, textResponse.status);
      return res.status(502).json({ message: `Failed to fetch raw text (status ${textResponse.status})` });
    }

    const rawText = await textResponse.text();

    // Clean up: strip HTML tags, drop non-printable control chars (the raw
    // Federal Register text embeds NUL/page-break bytes), collapse whitespace
    // runs, trim.
    const cleaned = rawText
      .replace(/<[^>]*>/g, ' ')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    cacheFullText(documentNumber, cleaned);

    return res.json({ text: cleaned });
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      return res.status(504).json({ message: 'Request timeout' });
    }
    console.error(`EO full text error for ${documentNumber}:`, error);
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Middleware to validate API provider
const validateProvider = (req, res, next) => {
  const provider = req.params.provider;
  if (!['latimer', 'perplexity', 'deepseek'].includes(provider)) {
    return res.status(400).json({ message: 'Invalid API provider' });
  }
  next();
};

// Middleware to validate API configuration
const validateApiConfig = (req, res, next) => {
  const { provider } = req.params;
  const apiKey = process.env[`${provider.toUpperCase()}_API_KEY`];
  const baseUrl = process.env[`${provider.toUpperCase()}_BASE_URL`];

  if (!apiKey || !baseUrl) {
    console.error(`Missing ${provider} configuration:`, {
      hasApiKey: !!apiKey,
      hasBaseUrl: !!baseUrl
    });
    return res.status(500).json({ 
      message: `${provider} API configuration missing. Please check your environment variables.` 
    });
  }
  
  req.apiConfig = { apiKey, baseUrl };
  next();
};

// Proxy endpoint for AI services
app.post('/api/:provider/*', validateProvider, validateApiConfig, async (req, res) => {
  try {
    const { provider } = req.params;
    const { apiKey, baseUrl } = req.apiConfig;

    // Get the endpoint path from the original URL
    const endpoint = req.originalUrl.split(`/api/${provider}/`)[1];
    const url = `${baseUrl}/${endpoint}`;

    console.log(`Proxying request to ${provider}:`, {
      url,
      method: req.method,
      hasBody: !!req.body
    });

    // Add timeout to the fetch request
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      // Prepare headers and body based on provider
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };

      let body = { ...req.body };

      // Configure provider-specific authentication
      switch (provider) {
        case 'perplexity':
          headers['Authorization'] = `Bearer ${apiKey}`;
          break;
        case 'latimer':
          body.apiKey = apiKey;
          break;
        case 'deepseek':
          body.api_key = apiKey;
          break;
      }

      const response = await fetch(url, {
        method: req.method,
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeout);

      const contentType = response.headers.get('content-type');
      
      // Handle different response types
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        
        if (!response.ok) {
          console.error(`${provider} API error:`, {
            status: response.status,
            data
          });
          return res.status(response.status).json({
            message: data.error?.message || data.message || `${provider} API error`
          });
        }
        
        return res.json(data);
      } else {
        // For non-JSON responses, return error
        const text = await response.text();
        console.error(`Invalid response format from ${provider}:`, {
          contentType,
          responsePreview: text.substring(0, 200)
        });
        return res.status(500).json({
          message: `${provider} API returned invalid format`,
          details: text.substring(0, 200)
        });
      }
    } catch (error) {
      clearTimeout(timeout);
      if (error.name === 'AbortError') {
        return res.status(504).json({ message: 'Request timeout' });
      }
      throw error;
    }
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Development mode: proxy to Vite dev server with retry mechanism
if (process.env.NODE_ENV !== 'production') {
  const proxyToVite = async (req, res, retries = 3, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`http://localhost:5173${req.url}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Copy all headers from the Vite response
        for (const [key, value] of response.headers) {
          res.setHeader(key, value);
        }

        // Handle different response types
        const contentType = response.headers.get('content-type');
        if (contentType?.includes('text/html')) {
          const text = await response.text();
          res.send(text);
        } else if (contentType?.includes('application/json')) {
          const json = await response.json();
          res.json(json);
        } else {
          // For binary data (images, etc), use arrayBuffer
          const buffer = await response.arrayBuffer();
          res.send(Buffer.from(buffer));
        }
        return;
      } catch (error) {
        if (i === retries - 1) {
          console.error('Error proxying to Vite dev server:', error);
          res.status(503).send('Development server not ready. Please try again in a moment...');
          return;
        }
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
      }
    }
  };

  app.get('*', (req, res) => {
    proxyToVite(req, res);
  });

  // Set up WebSocket proxy for HMR
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    let viteWs = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    const connectToVite = () => {
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        return;
      }

      viteWs = new WebSocket('ws://localhost:5173');
      
      viteWs.on('open', () => {
        console.log('Connected to Vite WebSocket server');
        reconnectAttempts = 0;
      });
      
      viteWs.on('message', (data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });
      
      viteWs.on('close', () => {
        console.log('Vite WebSocket connection closed');
        reconnectAttempts++;
        setTimeout(connectToVite, 1000 * Math.pow(2, reconnectAttempts));
      });
      
      viteWs.on('error', (error) => {
        console.error('Vite WebSocket error:', error);
        viteWs.close();
      });
    };
    
    connectToVite();
    
    ws.on('message', (data) => {
      if (viteWs && viteWs.readyState === WebSocket.OPEN) {
        viteWs.send(data);
      }
    });
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      if (viteWs) {
        viteWs.close();
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket client error:', error);
      if (viteWs) {
        viteWs.close();
      }
    });
  });
} else {
  // Production mode: serve index.html for all other routes (SPA support)
  app.get('*', (req, res) => {
    const indexPath = join(__dirname, 'dist', 'index.html');
    
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Application not built. Please run npm run build first.');
    }
  });
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Start server
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Environment check:', {
    LATIMER_CONFIG: {
      hasApiKey: !!process.env.LATIMER_API_KEY,
      hasBaseUrl: !!process.env.LATIMER_BASE_URL,
      baseUrl: process.env.LATIMER_BASE_URL
    },
    PERPLEXITY_CONFIG: {
      hasApiKey: !!process.env.PERPLEXITY_API_KEY,
      hasBaseUrl: !!process.env.PERPLEXITY_BASE_URL,
      baseUrl: process.env.PERPLEXITY_BASE_URL
    },
    DEEPSEEK_CONFIG: {
      hasApiKey: !!process.env.DEEPSEEK_API_KEY,
      hasBaseUrl: !!process.env.DEEPSEEK_BASE_URL,
      baseUrl: process.env.DEEPSEEK_BASE_URL
    }
  });
});