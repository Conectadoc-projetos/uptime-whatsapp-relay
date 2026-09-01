const express = require('express');

function formatMessage(payload) {
  const monitorName = payload?.monitor?.name || 'monitor desconhecido';
  const status = payload?.heartbeat?.status;
  const time = payload?.heartbeat?.time || new Date().toISOString();

  if (status === 1) {
    return `🟢 *${monitorName}* voltou ao normal (${time})`;
  }
  return `🔴 *${monitorName}* está FORA DO AR desde ${time}`;
}

function createApp() {
  const app = express();
  app.use(express.json());

  app.post('/notify', async (req, res) => {
    const apiKey = process.env.EVOLUTION_API_KEY;
    if (!apiKey) {
      console.error('EVOLUTION_API_KEY nao configurada');
      return res.status(500).json({ error: 'EVOLUTION_API_KEY nao configurada' });
    }

    const baseUrl = process.env.EVOLUTION_BASE_URL || 'https://evolution-api.conectadoc.com.br';
    const instance = process.env.EVOLUTION_INSTANCE || 'CONECTADOC';
    const alertNumber = process.env.ALERT_NUMBER || '5541996907709';
    const text = formatMessage(req.body);

    try {
      const response = await fetch(`${baseUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: apiKey,
        },
        body: JSON.stringify({ number: alertNumber, text }),
      });

      if (!response.ok) {
        const body = await response.text();
        console.error('Evolution API retornou erro', response.status, body);
        return res.status(502).json({ error: 'Evolution API retornou erro', status: response.status });
      }

      return res.status(200).json({ sent: true });
    } catch (err) {
      console.error('Erro ao chamar Evolution API', err.message);
      return res.status(502).json({ error: 'Erro ao chamar Evolution API' });
    }
  });

  app.get('/health', (req, res) => res.status(200).json({ ok: true }));

  return app;
}

function start() {
  const app = createApp();
  const port = process.env.PORT || 3000;
  const server = app.listen(port, () => {
    console.log(`uptime-whatsapp-relay ouvindo na porta ${port}`);
  });
  return server;
}

if (require.main === module) {
  start();
}

module.exports = { createApp, start };
