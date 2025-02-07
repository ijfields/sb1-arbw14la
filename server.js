import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import * as dotenv from 'dotenv';
import { createServer } from 'http';
import os from 'os';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const port = 3000;

// Get the directory name of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));

// Middleware setup
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Debug middleware to log all requests
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Starting`);
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// Basic route to test server
app.get('/', (req, res) => {
  console.log('Root endpoint called');
  res.send('Server is running');
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('Health check endpoint called');
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// Test if server can bind to port
const testPort = (port) => {
  return new Promise((resolve, reject) => {
    const test = createServer();
    test.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        reject(err);
      }
    });
    test.once('listening', () => {
      test.close();
      resolve(true);
    });
    test.listen(port);
  });
};

// Start server with enhanced error handling
const startServer = async () => {
  try {
    // Check if port is available
    const portAvailable = await testPort(port);
    if (!portAvailable) {
      console.error(`Port ${port} is already in use. Please close other applications using this port or change the port number.`);
      process.exit(1);
    }

    // Try to start the server
    server.listen(port, '0.0.0.0', () => {
      const addresses = Object.values(os.networkInterfaces())
        .flat()
        .filter(details => details.family === 'IPv4')
        .map(details => details.address);

      console.log('\nServer started successfully:');
      console.log(`- Local: http://localhost:${port}`);
      addresses.forEach(addr => console.log(`- Network: http://${addr}:${port}`));
      console.log('\nEnvironment:', process.env.NODE_ENV || 'development');
      console.log('CORS origins:', ['http://localhost:5173', 'http://127.0.0.1:5173']);
      console.log('\nTry accessing:');
      console.log(`1. http://localhost:${port}/api/health`);
      console.log(`2. http://127.0.0.1:${port}/api/health\n`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Error handling
server.on('error', (error) => {
  console.error('Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Please close other applications using this port or change the port number.`);
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});