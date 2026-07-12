import { beforeAll, afterAll, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Polyfill BroadcastChannel for Node.js environment
if (typeof globalThis.BroadcastChannel === 'undefined') {
  globalThis.BroadcastChannel = class {
    name: string;
    constructor(name: string) {
      this.name = name;
    }
    postMessage() {}
    close() {}
  } as any;
}

// Mock API handlers
const handlers = [
  // Latimer API
  http.post('*/api/latimer/getCompletion', () => {
    return HttpResponse.json({
      message: {
        content: 'Test assessment from Latimer. The documents show positive alignment.\n\nRating: positive'
      }
    });
  }),

  // Perplexity API
  http.post('*/api/perplexity/chat/completions', () => {
    return HttpResponse.json({
      choices: [{
        message: {
          content: 'Test assessment from Perplexity. The documents show neutral alignment.\n\nRating: neutral'
        },
        finish_reason: 'stop'
      }],
      usage: {
        total_tokens: 100
      }
    });
  }),

  // DeepSeek API
  http.post('*/api/deepseek/v1/chat/completions', async ({ request }) => {
    const body = await request.json() as any;

    // Check for API key
    if (!body.api_key) {
      return HttpResponse.json(
        { error: { message: 'Authentication Fails (governor)' } },
        { status: 401 }
      );
    }

    return HttpResponse.json({
      choices: [{
        message: {
          content: 'Test assessment from DeepSeek. The documents show negative alignment.\n\nRating: negative'
        },
        finish_reason: 'stop'
      }],
      usage: {
        total_tokens: 100
      }
    });
  })
];

// Create MSW server instance
const server = setupServer(...handlers);

// Start server before all tests
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

// Reset handlers after each test
afterEach(() => {
  server.resetHandlers();
});

// Clean up after all tests are done
afterAll(() => {
  server.close();
});

export { server };