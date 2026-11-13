// Produtores: páginas públicas, edição da página pela própria conta e estatísticas de vendas
const router = require('express').Router();
const { Types } = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Auction = require('../models/Auction');
const auth = require('../middleware/auth');
const a = require('../utils/async');
const erro = require('../utils/erro');

const escaparRegex = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const STOCK_BAIXO = 10;

// GET /api/producers?localidade=
router.get('/', a(async (req, res) => {
  const filtro = { papel: 'produtor', 'produtor.validado': true };
  if (req.query.localidade) {
    filtro['produtor.localidade'] = { $regex: escaparRegex(req.query.localidade), $options: 'i' };
  }
  const lista = await User.find(filtro).select('nome produtor').sort({ nome: 1 });
  res.json(lista);
}));

// GET /api/producers/eu/estatisticas (produtor) -> indicadores de vendas, encomendas e avaliações
router.get('/eu/estatisticas', auth('produtor'), a(async (req, res) => {
  const id = new Types.ObjectId(req.user.id);
  const desde30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [vendas, porEstado, avaliacoes, stockBaixo, leiloesAtivos, maisVendidos] = await Promise.all([
    Order.aggregate([
      { $match: { produtor: id } },
      { $group: { _id: null, total: { $sum: '$total' }, ultimos30: { $sum: { $cond: [{ $gte: ['$createdAt', desde30] }, '$total', 0] } }, n: { $sum: 1 } } }
    ]),
    Order.aggregate([{ $match: { produtor: id } }, { $group: { _id: '$estado', n: { $sum: 1 } } }]),
    Review.aggregate([{ $match: { produtor: id, visivel: true } }, { $group: { _id: null, media: { $avg: '$classificacao' }, n: { $sum: 1 } } }]),
    Product.find({ produtor: id, stock: { $lt: STOCK_BAIXO } }).select('nome stock unidade').sort({ stock: 1 }),
    Auction.countDocuments({ produtor: id, estado: 'ativo' }),
    Order.aggregate([
      { $match: { produtor: id } },
      { $unwind: '$linhas' },
      { $group: { _id: '$linhas.nome', quantidade: { $sum: '$linhas.quantidade' }, receita: { $sum: { $multiply: ['$linhas.quantidade', '$linhas.precoUnit'] } } } },
      { $sort: { receita: -1 } },
      { $limit: 5 }
    ])
  ]);
  const r2 = (v) => Math.round((v || 0) * 100) / 100;
  res.json({
    vendasTotal: r2(vendas[0]?.total),
    vendasUltimos30Dias: r2(vendas[0]?.ultimos30),
    numEncomendas: vendas[0]?.n || 0,
    encomendasPorEstado: Object.fromEntries(Order.ESTADOS.map((e) => [e, porEstado.find((x) => x._id === e)?.n || 0])),
    avaliacaoMedia: Math.round((avaliacoes[0]?.media || 0) * 10) / 10,
    numAvaliacoes: avaliacoes[0]?.n || 0,
    stockBaixo,
    leiloesAtivos,
    maisVendidos: maisVendidos.map((m) => ({ nome: m._id, quantidade: m.quantidade, receita: r2(m.receita) }))
  });
}));

// PUT /api/producers/eu (produtor) -> atualiza a página pública
router.put('/eu', auth('produtor'), a(async (req, res) => {
  const { nomeExploracao, descricao, localidade, localizacao } = req.body;
  const set = {};
  if (nomeExploracao !== undefined) set['produtor.nomeExploracao'] = nomeExploracao;
  if (descricao !== undefined) set['produtor.descricao'] = descricao;
  if (localidade !== undefined) set['produtor.localidade'] = localidade;
  if (localizacao !== undefined) {
    const lat = Number(localizacao?.lat);
    const lng = Number(localizacao?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw erro(400, 'Localização inválida');
    set['produtor.localizacao'] = { lat, lng };
  }
  const u = await User.findOneAndUpdate({ _id: req.user.id, papel: 'produtor' }, { $set: set }, { new: true, runValidators: true });
  if (!u) throw erro(404, 'Produtor não encontrado');
  res.json(u.publico());
}));

// GET /api/producers/:id -> página pública (produtor, produtos e avaliação média)
router.get('/:id', a(async (req, res) => {
  const produtor = await User.findOne({ _id: req.params.id, papel: 'produtor', 'produtor.validado': true }).select('nome produtor');
  if (!produtor) throw erro(404, 'Produtor não encontrado');

  const [produtos, avaliacoes] = await Promise.all([
    Product.find({ produtor: produtor._id }).sort({ nome: 1 }),
    Review.aggregate([{ $match: { produtor: produtor._id, visivel: true } }, { $group: { _id: null, media: { $avg: '$classificacao' }, n: { $sum: 1 } } }])
  ]);
  res.json({
    produtor,
    produtos,
    avaliacaoMedia: Math.round((avaliacoes[0]?.media || 0) * 10) / 10,
    numAvaliacoes: avaliacoes[0]?.n || 0
  });
}));

module.exports = router;
