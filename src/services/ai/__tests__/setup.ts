import { beforeAll, afterAll, afterEach } from 'vitest';
import { rest } from 'msw';
import { setupServer } from 'msw/node';

// Polyfill BroadcastChannel for Node.js environment
if (typeof global.BroadcastChannel === 'undefined') {
  global.BroadcastChannel = class {
    constructor(name) {
      this.name = name;
    }
    postMessage() {}
    close() {}
  };
}

// Mock API handlers
const handlers = [
  // Latimer API
  rest.post('*/api/latimer/getCompletion', (req, res, ctx) => {
    return res(
      ctx.json({
        message: {
          content: 'Test assessment from Latimer. The documents show positive alignment.\n\nRating: positive'
        }
      })
    );
  }),

  // Perplexity API
  rest.post('*/api/perplexity/chat/completions', (req, res, ctx) => {
    return res(
      ctx.json({
        choices: [{
          message: {
            content: 'Test assessment from Perplexity. The documents show neutral alignment.\n\nRating: neutral'
          },
          finish_reason: 'stop'
        }],
        usage: {
          total_tokens: 100
        }
      })
    );
  }),

  // DeepSeek API
  rest.post('*/api/deepseek/v1/chat/completions', async (req, res, ctx) => {
    const body = await req.json();
    
    // Check for API key
    if (!body.api_key) {
      return res(
        ctx.status(401),
        ctx.json({ error: { message: 'Authentication Fails (governor)' } })
      );
    }

    return res(
      ctx.json({
        choices: [{
          message: {
            content: 'Test assessment from DeepSeek. The documents show negative alignment.\n\nRating: negative'
          },
          finish_reason: 'stop'
        }],
        usage: {
          total_tokens: 100
        }
      })
    );
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