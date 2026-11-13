// Avaliações de produtos e produtores
const router = require('express').Router();
const Review = require('../models/Review');
const Order = require('../models/Order');
const auth = require('../middleware/auth');
const a = require('../utils/async');
const erro = require('../utils/erro');
const { atualizarMediaProduto } = require('../services/avaliacoes');

// POST /api/reviews (comprador, depois de a encomenda ser entregue) -> 201 | 404 | 409
// Sem "produto" a avaliação é ao produtor; com "produto" tem de ser uma linha da encomenda.
router.post('/', auth('comprador'), a(async (req, res) => {
  const { encomenda, produto, classificacao, comentario } = req.body;
  if (!encomenda) throw erro(400, 'Indique a encomenda');
  const o = await Order.findOne({ _id: encomenda, comprador: req.user.id });
  if (!o) throw erro(404, 'Encomenda não encontrada');
  if (o.estado !== 'entregue') throw erro(409, 'Só pode avaliar encomendas entregues');
  if (produto && !o.linhas.some((l) => l.produto?.toString() === String(produto))) {
    throw erro(400, 'O produto não pertence a esta encomenda');
  }

  const r = await Review.create({
    autor: req.user.id, produtor: o.produtor, produto: produto || undefined, encomenda, classificacao, comentario
  }).catch((err) => {
    if (err.code === 11000) throw erro(409, 'Já avaliou esta encomenda');
    throw err;
  });
  await atualizarMediaProduto(produto);
  res.status(201).json(r);
}));

// GET /api/reviews?produtor=&produto=
router.get('/', a(async (req, res) => {
  const filtro = { visivel: true };
  if (req.query.produtor) filtro.produtor = req.query.produtor;
  if (req.query.produto) filtro.produto = req.query.produto;
  const lista = await Review.find(filtro)
    .populate('autor', 'nome')
    .populate('produto', 'nome')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(lista);
}));

// POST /api/reviews/:id/denuncia (qualquer utilizador autenticado) -> 204
router.post('/:id/denuncia', auth(), a(async (req, res) => {
  const r = await Review.findByIdAndUpdate(req.params.id, { $inc: { denuncias: 1 } });
  if (!r) throw erro(404, 'Avaliação não encontrada');
  res.status(204).end();
}));

module.exports = router;
