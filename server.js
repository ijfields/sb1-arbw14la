import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import net from 'net';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
let port = parseInt(process.env.PORT || '3000', 10);

// Get the directory name of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));

// Check if port is in use
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        server.close();
        resolve(true);
      })
      .listen(port);
  });
}

// Find next available port
async function findAvailablePort(startPort) {
  let currentPort = startPort;
  const maxPort = startPort + 100;

  while (currentPort < maxPort) {
    if (await isPortAvailable(currentPort)) {
      return currentPort;
    }
    currentPort++;
  }
  throw new Error('No available ports found');
}

// Kill process using port
async function killProcessOnPort(port) {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const cmd = isWin ? 
      `netstat -ano | findstr :${port}` :
      `lsof -i :${port} -t`;

    import('child_process').then(({ exec }) => {
      exec(cmd, (err, stdout) => {
        if (err || !stdout) {
          resolve(false);
          return;
        }

        const pid = isWin ?
          stdout.split('\n')[0].split(/\s+/)[4] :
          stdout.trim();

        if (pid) {
          const killCmd = isWin ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`;
          exec(killCmd, (err) => {
            if (err) {
              console.warn(`Failed to kill process on port ${port}:`, err);
              resolve(false);
            } else {
              console.log(`Killed process ${pid} on port ${port}`);
              resolve(true);
            }
          });
        } else {
          resolve(false);
        }
      });
    });
  });
}

// CSP middleware
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', `
    default-src 'self';
    script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.webcontainer.io;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    font-src 'self' data:;
    connect-src 'self' ws: wss: https: http:;
    frame-src 'self';
    worker-src 'self' blob:;
  `.replace(/\s+/g, ' ').trim());
  next();
});

// CORS middleware with proper configuration
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    /\.webcontainer\.io$/
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With'
  ]
}));

app.use(express.json());

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  
  res.status(500).json({
    message: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// Serve static files
const distPath = join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
      hasSupabaseKey: !!process.env.VITE_SUPABASE_ANON_KEY,
      hasLatimerConfig: !!process.env.VITE_LATIMER_API_KEY && !!process.env.VITE_LATIMER_BASE_URL,
      hasPerplexityConfig: !!process.env.VITE_PERPLEXITY_API_KEY && !!process.env.VITE_PERPLEXITY_BASE_URL
    }
  });
});

// WebSocket setup with improved error handling
const wss = new WebSocketServer({ 
  server,
  path: '/ws',
  clientTracking: true
});

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  let viteWs = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 5;
  let reconnectTimeout = null;
  
  const connectToVite = () => {
    if (reconnectAttempts >= maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    if (viteWs) {
      viteWs.close();
      viteWs = null;
    }

    viteWs = new WebSocket('ws://localhost:5173');
    
    viteWs.on('open', () => {
      console.log('Connected to Vite WebSocket server');
      reconnectAttempts = 0;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
    });
    
    viteWs.on('message', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch (error) {
          console.error('Error sending message to client:', error);
        }
      }
    });
    
    viteWs.on('close', () => {
      console.log('Vite WebSocket connection closed');
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectTimeout = setTimeout(connectToVite, delay);
      }
    });
    
    viteWs.on('error', (error) => {
      console.error('Vite WebSocket error:', error);
      viteWs.close();
    });
  };
  
  connectToVite();
  
  ws.on('message', (data) => {
    if (viteWs && viteWs.readyState === WebSocket.OPEN) {
      try {
        viteWs.send(data);
      } catch (error) {
        console.error('Error sending message to Vite:', error);
      }
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (viteWs) {
      viteWs.close();
      viteWs = null;
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket client error:', error);
    if (viteWs) {
      viteWs.close();
      viteWs = null;
    }
  });
});

// Start server with retries
async function startServer() {
  try {
    await killProcessOnPort(port);
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (await isPortAvailable(port)) {
      server.listen(port);
    } else {
      port = await findAvailablePort(port + 1);
      server.listen(port);
    }

    console.log(`Server running at http://localhost:${port}`);
    console.log('Environment check:', {
      NODE_ENV: process.env.NODE_ENV,
      hasSupabaseConfig: !!process.env.VITE_SUPABASE_URL && !!process.env.VITE_SUPABASE_ANON_KEY,
      port
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Cleanup on exit
process.on('SIGINT', () => {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
  }
  wss.close(() => {
    server.close(() => {
      console.log('Server shut down gracefully');
      process.exit(0);
    });
  });
});

// Start the server
startServer();