// Ciclo de vida dos leilões: agendado -> ativo -> terminado.
// Cada mudança é condicionada ao estado anterior, por isso com várias instâncias da API só uma
// consegue abrir/fechar cada leilão.
const Auction = require('../models/Auction');
const Order = require('../models/Order');

const INTERVALO_MS = 2000;
const sala = (id) => `leilao:${id}`;

async function abrirAgendados(io) {
  const agora = new Date();
  const lista = await Auction.find({ estado: 'agendado', iniciaEm: { $lte: agora } }).select('_id');
  for (const { _id } of lista) {
    const l = await Auction.findOneAndUpdate({ _id, estado: 'agendado' }, { estado: 'ativo' }, { new: true });
    if (!l) continue;
    io.to(sala(_id)).emit('aberto', { id: _id });
    io.to('admins').emit('leilao-atualizado', { id: _id, estado: 'ativo' });
  }
}

async function fecharExpirados(io) {
  const agora = new Date();
  const lista = await Auction.find({ estado: { $in: ['ativo', 'agendado'] }, terminaEm: { $lte: agora } }).select('_id');
  for (const { _id } of lista) {
    const l = await Auction.findOneAndUpdate(
      { _id, estado: { $in: ['ativo', 'agendado'] } },
      { estado: 'terminado' },
      { new: true }
    );
    if (!l) continue; // outra instância já o fechou

    const vencedor = l.licitacaoAtual?.comprador;
    let encomenda = null;
    if (vencedor) {
      // O vencedor recebe uma encomenda confirmada com o lote
      encomenda = await Order.create({
        comprador: vencedor,
        produtor: l.produtor,
        linhas: [{
          produto: l.produto, nome: `Lote: ${l.lote}`, precoUnit: l.licitacaoAtual.valor, unidade: 'lote', quantidade: 1
        }],
        estado: 'confirmada',
        origem: 'leilao',
        leilao: l._id
      });
      await Auction.updateOne({ _id }, { encomenda: encomenda._id });
      io.to(`user:${vencedor}`).emit('leilao-ganho', {
        id: l._id, lote: l.lote, valor: l.licitacaoAtual.valor, encomenda: encomenda._id
      });
    }

    const resultado = {
      id: l._id,
      vencedor: vencedor ? { id: vencedor, nome: l.licitacaoAtual.nome } : null,
      valor: vencedor ? l.licitacaoAtual.valor : null
    };
    io.to(sala(_id)).emit('terminado', resultado);
    io.to(`user:${l.produtor}`).emit('leilao-terminado', { ...resultado, lote: l.lote, encomenda: encomenda?._id });
    io.to('admins').emit('leilao-atualizado', { id: _id, estado: 'terminado' });
  }
}

let timer = null;
function iniciarCicloLeiloes(io) {
  if (timer) return;
  const tick = () => abrirAgendados(io).then(() => fecharExpirados(io)).catch((err) => console.error('Ciclo de leilões:', err));
  tick();
  timer = setInterval(tick, INTERVALO_MS);
  timer.unref?.();
}

module.exports = { iniciarCicloLeiloes, abrirAgendados, fecharExpirados };
