import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { chat } from '../src/agent/llm.js';

function startServer(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, port });
    });
  });
}

function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

test('retries 503 and honors Retry-After', async () => {
  let count = 0;
  const { server, port } = await startServer(async (req, res) => {
    await readBody(req);
    count++;
    if (count <= 2) {
      res.writeHead(503, {
        'Content-Type': 'application/json',
        'Retry-After': '0.02'
      });
      res.end(JSON.stringify({ error: { message: 'service temporarily unavailable' } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: '重试成功' } }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });

  const retries = [];
  const result = await chat({
    settings: {
      provider: 'custom',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      apiKey: 'test',
      model: 'test',
      temperature: 0,
      stream: true,
      maxRetries: 3,
      retryBaseDelay: 20
    },
    messages: [{ role: 'user', content: 'hi' }],
    tools: [],
    onRetry: info => retries.push({ attempt: info.attempt, status: info.status })
  });

  assert.equal(result.content, '重试成功');
  assert.equal(count, 3);
  assert.deepEqual(retries, [
    { attempt: 1, status: 503 },
    { attempt: 2, status: 503 }
  ]);
  server.close();
});

test('reports the number of attempted retries after exhaustion', async () => {
  const { server, port } = await startServer(async (req, res) => {
    await readBody(req);
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'service temporarily unavailable' } }));
  });

  await assert.rejects(
    chat({
      settings: {
        provider: 'custom',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        apiKey: 'test',
        model: 'test',
        temperature: 0,
        stream: true,
        maxRetries: 1,
        retryBaseDelay: 10
      },
      messages: [{ role: 'user', content: 'hi' }],
      tools: []
    }),
    /已重试 1 次/
  );
  server.close();
});
