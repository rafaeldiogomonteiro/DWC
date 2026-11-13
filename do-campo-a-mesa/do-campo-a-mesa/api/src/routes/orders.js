// Passo 3: encomendas
const router = require('express').Router();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const a = require('../utils/async');
const erro = require('../utils/erro');

const ESTADOS = Order.ESTADOS;

// Devolve o stock já reservado quando uma linha falha
async function reporStock(reservas) {
  await Promise.all(reservas.map(({ id, q }) => Product.updateOne({ _id: id }, { $inc: { stock: q } })));
}

// POST /api/orders (comprador) -> 201 [encomendas]
// O carrinho pode ter produtos de vários produtores: cria-se uma encomenda por produtor.
router.post('/', auth('comprador'), a(async (req, res) => {
  const { linhas, entrega = {} } = req.body;
  if (!Array.isArray(linhas) || !linhas.length) throw erro(400, 'A encomenda tem de ter pelo menos uma linha');
  if (entrega.tipo === 'entrega' && !entrega.morada?.trim()) throw erro(400, 'Indique a morada de entrega');

  const reservas = [];
  const porProdutor = new Map();
  try {
    for (const l of linhas) {
      const q = Number(l.quantidade);
      if (!Number.isInteger(q) || q < 1) throw erro(400, 'Quantidade inválida');
      if (!mongoose.isValidObjectId(l.produto)) throw erro(400, 'Produto inválido');

      // Condição e atualização numa só operação: nunca se vende o que não existe
      const p = await Product.findOneAndUpdate(
        { _id: l.produto, stock: { $gte: q } },
        { $inc: { stock: -q } },
        { new: true }
      );
      if (!p) {
        const existe = await Product.findById(l.produto).select('nome');
        throw erro(existe ? 409 : 404, existe ? `Stock insuficiente: ${existe.nome}` : 'Produto não encontrado');
      }
      reservas.push({ id: p._id, q });

      const chave = p.produtor.toString();
      if (!porProdutor.has(chave)) porProdutor.set(chave, []);
      porProdutor.get(chave).push({ produto: p._id, nome: p.nome, precoUnit: p.preco, unidade: p.unidade, quantidade: q });
    }

    const criadas = await Order.create([...porProdutor].map(([produtor, ls]) => ({
      comprador: req.user.id,
      produtor,
      linhas: ls,
      entrega: { tipo: entrega.tipo || 'levantamento', morada: entrega.morada }
    })));

    // Avisa cada produtor em tempo real
    const io = req.app.get('io');
    criadas.forEach((o) => io?.to(`user:${o.produtor}`).emit('nova-encomenda', { id: o._id, total: o.total, comprador: req.user.nome }));
    res.status(201).json(criadas);
  } catch (err) {
    await reporStock(reservas);
    throw err;
  }
}));

// GET /api/orders -> encomendas do comprador ou do produtor autenticado (admin: todas)
router.get('/', auth(), a(async (req, res) => {
  const filtro = {
    produtor: { produtor: req.user.id },
    comprador: { comprador: req.user.id },
    admin: {}
  }[req.user.papel];
  if (req.query.estado) filtro.estado = req.query.estado;
  const lista = await Order.find(filtro)
    .populate('comprador', 'nome email')
    .populate('produtor', 'nome produtor.nomeExploracao produtor.localidade')
    .sort({ createdAt: -1 })
    .limit(200);
  res.json(lista);
}));

// GET /api/orders/:id
router.get('/:id', auth(), a(async (req, res) => {
  const o = await Order.findById(req.params.id)
    .populate('comprador', 'nome email')
    .populate('produtor', 'nome produtor.nomeExploracao produtor.localidade');
  if (!o) throw erro(404, 'Encomenda não encontrada');
  const id = req.user.id;
  if (o.comprador._id.toString() !== id && o.produtor._id.toString() !== id && req.user.papel !== 'admin') {
    throw erro(403, 'Sem permissão');
  }
  res.json(o);
}));

// PATCH /api/orders/:id/estado (produtor dono) -> 200 | 400 | 404 | 409
// O estado só pode avançar. A verificação está no filtro do update: dois pedidos simultâneos
// não conseguem saltar ou recuar estados.
router.patch('/:id/estado', auth('produtor'), a(async (req, res) => {
  const { estado } = req.body;
  const novo = ESTADOS.indexOf(estado);
  if (novo < 0) throw erro(400, 'Estado inválido');

  const o = await Order.findOneAndUpdate(
    { _id: req.params.id, produtor: req.user.id, estado: { $in: ESTADOS.slice(0, novo) } },
    { $set: { estado }, $push: { historicoEstados: { estado, em: new Date() } } },
    { new: true, runValidators: true }
  );
  if (!o) {
    const existe = await Order.exists({ _id: req.params.id, produtor: req.user.id });
    throw erro(existe ? 409 : 404, existe ? 'O estado só pode avançar' : 'Encomenda não encontrada');
  }

  // Notificação em tempo real para a sala pessoal do comprador
  req.app.get('io')?.to(`user:${o.comprador}`).emit('encomenda-atualizada', {
    id: o._id, estado: o.estado, produtor: req.user.nome
  });
  res.json(o);
}));

module.exports = router;
