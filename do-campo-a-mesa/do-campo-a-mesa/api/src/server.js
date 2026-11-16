// Ponto de entrada: servidor HTTP partilhado pela API REST e pelo Socket.io
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { ligarBD } = require('./config/db');
const registarSockets = require('./sockets');
const { iniciarCicloLeiloes } = require('./services/cicloLeiloes');
const { origemPermitida } = require('./config/cors');

const PORT = process.env.PORT || 3000;

async function iniciar() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não está definida (ver .env.example)');
  await ligarBD();

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: origemPermitida() }
  });

  // Disponibiliza o io às rotas (ex.: notificar o comprador quando a encomenda muda)
  app.set('io', io);
  registarSockets(io);
  // Abre os leilões agendados e fecha os que expiraram
  iniciarCicloLeiloes(io);

  await new Promise((resolve) => server.listen(PORT, resolve));
  const { port } = server.address();
  console.log(`API em http://localhost:${port}`);
  console.log(`Documentação em http://localhost:${port}/api-docs`);
  return server;
}

module.exports = iniciar;

if (require.main === module) {
  iniciar().catch((err) => {
    console.error('Erro ao iniciar o servidor:', err);
    process.exit(1);
  });
}
