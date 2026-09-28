require('dotenv').config();

const http = require('http');
const { randomUUID } = require('crypto');
const cors = require('cors');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);
const frontendOrigin = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const port = Number(process.env.PORT) || 3000;

const io = new Server(httpServer, {
  cors: {
    origin: frontendOrigin,
    methods: ['GET', 'POST'],
  },
});

const messages = [];

app.use(cors({ origin: frontendOrigin }));
app.use(express.json());

app.get('/api/messages', (req, res) => {
  res.json(messages);
});

function createMessage(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'Request body must be an object.' };
  }

  const username = typeof payload.username === 'string' ? payload.username.trim() : '';
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';

  if (!username) return { error: 'Username is required.' };
  if (!text) return { error: 'Message text is required.' };

  return {
    message: {
      id: randomUUID(),
      username,
      text,
      timestamp: new Date().toISOString(),
    },
  };
}

function saveAndBroadcast(payload) {
  const result = createMessage(payload);
  if (result.error) return result;

  messages.push(result.message);
  io.emit('new_message', result.message);
  return result;
}

app.post('/api/messages', (req, res) => {
  const result = saveAndBroadcast(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.status(201).json(result.message);
});

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('send_message', (payload, acknowledge) => {
    try {
      const result = saveAndBroadcast(payload);
      if (result.error) {
        if (typeof acknowledge === 'function') acknowledge({ error: result.error });
        else socket.emit('message_error', { error: result.error });
        return;
      }
      if (typeof acknowledge === 'function') acknowledge({ message: result.message });
    } catch (error) {
      console.error('Unable to process socket message:', error);
      if (typeof acknowledge === 'function') acknowledge({ error: 'Unable to send message.' });
      else socket.emit('message_error', { error: 'Unable to send message.' });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`Client disconnected: ${socket.id} (${reason})`);
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('Request error:', error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  res.status(status).json({
    error: status < 500 ? 'Invalid request.' : 'Internal server error.',
  });
});

httpServer.on('error', (error) => {
  console.error('Server error:', error);
  process.exitCode = 1;
});

httpServer.listen(port, () => {
  console.log(`Chat backend listening on port ${port}`);
  console.log(`Allowed frontend origin: ${frontendOrigin}`);
});
