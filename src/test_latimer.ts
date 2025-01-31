import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

async function waitForServer(retries = 10, delay = 1000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch('http://localhost:3000/api/health');
      if (response.ok) {
        console.log('Server is ready');
        return true;
      }
    } catch (error) {
      console.log(`Waiting for server... (attempt ${i + 1}/${retries})`);
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return false;
}

async function testLatimer() {
  try {
    const apiKey = process.env.VITE_LATIMER_API_KEY;
    const baseUrl = process.env.VITE_LATIMER_BASE_URL;

    if (!apiKey) {
      throw new Error('VITE_LATIMER_API_KEY not found in environment variables');
    }

    if (!baseUrl) {
      throw new Error('VITE_LATIMER_BASE_URL not found in environment variables');
    }

    console.log('Testing Latimer API with configuration:', {
      baseUrl,
      hasApiKey: !!apiKey
    });

    // Wait for server to be ready
    const serverReady = await waitForServer();
    if (!serverReady) {
      throw new Error('Server not available after multiple attempts');
    }

    const payload = {
      messages: [{
        role: "system",
        content: "You are an expert policy analyst."
      }, {
        role: "user",
        content: "Analyze this text: 'The executive order aims to strengthen environmental protections.'"
      }],
      max_tokens: 500,
      temperature: 0.7,
      model: "gpt-3.5-turbo"
    };

    console.log('Sending request to Latimer API...');
    const response = await fetch('http://localhost:3000/api/latimer/getCompletion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.message || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log('Latimer API Response:', {
      success: true,
      responsePreview: data.choices?.[0]?.message?.content?.substring(0, 100) || 'No content'
    });
    
    return data;
  } catch (error) {
    console.error('Error testing Latimer API:', error);
    throw error;
  }
}

// Run test
console.log('Starting Latimer API test...');
testLatimer()
  .then(result => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });