const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { createApp } = require('./server.js');

async function startMockEvolutionServer() {
  let receivedRequest = null;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      receivedRequest = {
        method: req.method,
        url: req.url,
        apikeyHeader: req.headers.apikey,
        body: JSON.parse(body),
      };
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'PENDING' }));
    });
  });
  await new Promise(resolve => server.listen(0, resolve));
  return {
    server,
    port: server.address().port,
    getReceivedRequest: () => receivedRequest,
  };
}

async function startRelay() {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  return { server, port: server.address().port };
}

test('POST /notify repassa alerta de queda formatado pra Evolution API', async () => {
  const mock = await startMockEvolutionServer();
  process.env.EVOLUTION_BASE_URL = `http://localhost:${mock.port}`;
  process.env.EVOLUTION_INSTANCE = 'CONECTADOC';
  process.env.EVOLUTION_API_KEY = 'test-key';
  process.env.ALERT_NUMBER = '5541996907709';

  const relay = await startRelay();

  const response = await fetch(`http://localhost:${relay.port}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      monitor: { name: 'cuidado-digital-api' },
      heartbeat: { status: 0, time: '2026-09-01 16:32:00' },
    }),
  });

  assert.strictEqual(response.status, 200);
  const received = mock.getReceivedRequest();
  assert.strictEqual(received.method, 'POST');
  assert.strictEqual(received.url, '/message/sendText/CONECTADOC');
  assert.strictEqual(received.apikeyHeader, 'test-key');
  assert.strictEqual(received.body.number, '5541996907709');
  assert.match(received.body.text, /FORA DO AR/);
  assert.match(received.body.text, /cuidado-digital-api/);

  relay.server.close();
  mock.server.close();
});

test('POST /notify formata mensagem de recuperacao quando status volta a 1', async () => {
  const mock = await startMockEvolutionServer();
  process.env.EVOLUTION_BASE_URL = `http://localhost:${mock.port}`;
  process.env.EVOLUTION_INSTANCE = 'CONECTADOC';
  process.env.EVOLUTION_API_KEY = 'test-key';
  process.env.ALERT_NUMBER = '5541996907709';

  const relay = await startRelay();

  const response = await fetch(`http://localhost:${relay.port}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      monitor: { name: 'cuidado-digital-api' },
      heartbeat: { status: 1, time: '2026-09-01 16:40:00' },
    }),
  });

  assert.strictEqual(response.status, 200);
  const received = mock.getReceivedRequest();
  assert.match(received.body.text, /voltou ao normal/);

  relay.server.close();
  mock.server.close();
});

test('POST /notify retorna 500 quando EVOLUTION_API_KEY nao esta configurada', async () => {
  delete process.env.EVOLUTION_API_KEY;
  process.env.EVOLUTION_BASE_URL = 'http://localhost:1';
  process.env.EVOLUTION_INSTANCE = 'CONECTADOC';
  process.env.ALERT_NUMBER = '5541996907709';

  const relay = await startRelay();

  const response = await fetch(`http://localhost:${relay.port}/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ monitor: { name: 'x' }, heartbeat: { status: 0 } }),
  });

  assert.strictEqual(response.status, 500);

  relay.server.close();
});

test('GET /health retorna 200 ok', async () => {
  process.env.EVOLUTION_API_KEY = 'test-key';
  const relay = await startRelay();

  const response = await fetch(`http://localhost:${relay.port}/health`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.ok, true);

  relay.server.close();
});
