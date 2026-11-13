// Passo 7: autenticação dos sockets com o mesmo JWT da API
const jwt = require('jsonwebtoken');
const registarLeiloes = require('./leiloes');

module.exports = (io) => {
  io.use((socket, next) => {
    try {
      const { token } = socket.handshake.auth;
      socket.user = jwt.verify(token, process.env.JWT_SECRET); // { id, papel, nome }
      next();
    } catch {
      next(new Error('não autorizado'));
    }
  });

  io.on('connection', (socket) => {
    // Sala pessoal: permite notificar este utilizador (encomendas, leilões ganhos, validação)
    socket.join(`user:${socket.user.id}`);
    // Os administradores acompanham todos os leilões ativos em tempo real
    if (socket.user.papel === 'admin') socket.join('admins');
    registarLeiloes(io, socket);
  });
};
