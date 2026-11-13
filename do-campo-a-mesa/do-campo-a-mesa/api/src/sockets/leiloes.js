// Passo 7: leilões em tempo real. O servidor é a fonte da verdade: cada licitação é validada e
// gravada numa única operação atómica (findOneAndUpdate) e só depois é feito o broadcast.
const mongoose = require('mongoose');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');

const sala = (leilaoId) => `leilao:${leilaoId}`;
const cent = (v) => Math.round(v * 100) / 100;

function emitirPresenca(io, leilaoId) {
  const n = io.sockets.adapter.rooms.get(sala(leilaoId))?.size ?? 0;
  io.to(sala(leilaoId)).emit('presenca', n);
}

module.exports = function registarLeiloes(io, socket) {
  socket.on('entrar', async (leilaoId) => {
    try {
      if (!mongoose.isValidObjectId(leilaoId)) return socket.emit('recusada', 'Leilão inválido');
      socket.join(sala(leilaoId));
      emitirPresenca(io, leilaoId);
      const leilao = await Auction.findById(leilaoId)
        .populate('produtor', 'nome produtor.localidade produtor.nomeExploracao')
        .populate('produto', 'nome imagemUrl');
      if (!leilao) return socket.emit('recusada', 'Leilão não encontrado');
      const licitacoes = await Bid.find({ leilao: leilaoId }).sort({ createdAt: -1 }).limit(20);
      // "agora" permite ao cliente acertar o relógio com o do servidor
      socket.emit('estado', { agora: new Date(), leilao, licitacoes });
    } catch (err) {
      console.error(err);
      socket.emit('recusada', 'Não foi possível entrar no leilão');
    }
  });

  socket.on('sair', (leilaoId) => {
    socket.leave(sala(leilaoId));
    emitirPresenca(io, leilaoId);
  });

  socket.on('licitar', async (dados, ack) => {
    const responder = typeof ack === 'function' ? ack : () => {};
    const recusar = (motivo) => {
      socket.emit('recusada', motivo);
      responder({ ok: false, erro: motivo });
    };
    try {
      const leilaoId = dados?.leilaoId;
      const valor = cent(Number(dados?.valor));
      if (socket.user.papel !== 'comprador') return recusar('Só compradores podem licitar');
      if (!mongoose.isValidObjectId(leilaoId)) return recusar('Leilão inválido');
      if (!Number.isFinite(valor) || valor <= 0) return recusar('Valor inválido');

      const base = await Auction.findById(leilaoId).select('incremento');
      if (!base) return recusar('Leilão não encontrado');

      // Atualização ATÓMICA: a condição e a escrita acontecem juntas no mesmo documento.
      // "licitacaoAtual.valor <= valor - incremento" equivale a "valor >= atual + incremento".
      const agora = new Date();
      const leilao = await Auction.findOneAndUpdate(
        {
          _id: leilaoId,
          estado: 'ativo',
          terminaEm: { $gt: agora },
          'licitacaoAtual.valor': { $lte: cent(valor - base.incremento) }
        },
        {
          $set: { licitacaoAtual: { valor, comprador: socket.user.id, nome: socket.user.nome, em: agora } },
          $inc: { numLicitacoes: 1 }
        },
        { new: true }
      );

      if (!leilao) {
        const atual = await Auction.findById(leilaoId).select('estado terminaEm licitacaoAtual incremento');
        if (atual.estado !== 'ativo' || atual.terminaEm <= agora) return recusar('O leilão não está ativo');
        return recusar(`Licitação mínima: ${cent(atual.licitacaoAtual.valor + atual.incremento).toFixed(2)} €`);
      }

      const bid = await Bid.create({ leilao: leilaoId, comprador: socket.user.id, nome: socket.user.nome, valor });
      const nova = {
        _id: bid._id,
        valor,
        comprador: socket.user.id,
        nome: socket.user.nome,
        createdAt: bid.createdAt,
        numLicitacoes: leilao.numLicitacoes
      };
      io.to(sala(leilaoId)).emit('nova-licitacao', nova);
      io.to('admins').emit('leilao-atualizado', { id: leilaoId, licitacaoAtual: leilao.licitacaoAtual, numLicitacoes: leilao.numLicitacoes });
      responder({ ok: true, valor });
    } catch (err) {
      console.error(err);
      recusar('Erro ao licitar');
    }
  });

  // Presença: o socket ainda está nas salas durante o "disconnecting"
  socket.on('disconnecting', () => {
    for (const s of socket.rooms) {
      if (s.startsWith('leilao:')) {
        setImmediate(() => emitirPresenca(io, s.slice('leilao:'.length)));
      }
    }
  });
};
