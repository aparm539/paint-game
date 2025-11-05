import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { setupSocketHandlers } from './socket-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Parse CORS origins from environment variable
const corsOrigin = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : '*';

const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

// Serve static files from client
const publicDir = join(__dirname, '../../client/public');
const distDir = join(__dirname, '../../client/dist');

app.use(express.static(publicDir));
app.use(express.static(distDir));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Setup Socket.io handlers
setupSocketHandlers(io);

// Serve index.html for all routes (SPA fallback)
app.get('*', (req, res) => {
  const distIndex = join(distDir, 'index.html');
  const devIndex = join(__dirname, '../../client/index.html');

  const fileToSend = existsSync(distIndex) ? distIndex : devIndex;
  res.sendFile(fileToSend);
});

httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

