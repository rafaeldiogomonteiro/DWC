// Leilões (REST); as licitações em direto são feitas por Socket.io
const router = require('express').Router();
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const produtorValidado = require('../middleware/produtorValidado');
const a = require('../utils/async');
const erro = require('../utils/erro');

const MIN = 60 * 1000;

// GET /api/auctions?estado=&produtor=&terminaAntesDe=
router.get('/', a(async (req, res) => {
  const filtro = {};
  if (req.query.estado) filtro.estado = req.query.estado;
  if (req.query.produtor) filtro.produtor = req.query.produtor;
  // Ex.: leilões ativos que terminam na próxima hora (?estado=ativo&terminaAntesDe=<ISO>)
  if (req.query.terminaAntesDe) filtro.terminaEm = { $lt: new Date(req.query.terminaAntesDe) };
  const lista = await Auction.find(filtro)
    .populate('produtor', 'nome produtor.nomeExploracao produtor.localidade')
    .populate('produto', 'nome imagemUrl')
    .sort({ terminaEm: 1 })
    .limit(100);
  res.json(lista);
}));

// POST /api/auctions (produtor validado) -> 201 + Location
router.post('/', auth('produtor'), produtorValidado, a(async (req, res) => {
  const { lote, descricao, quantidade, produto, precoBase, incremento, duracaoMinutos = 30, iniciaEm } = req.body;
  const minutos = Number(duracaoMinutos);
  if (!Number.isFinite(minutos) || minutos < 1 || minutos > 7 * 24 * 60) throw erro(400, 'Duração inválida (1 minuto a 7 dias)');
  if (produto && !(await Product.exists({ _id: produto, produtor: req.user.id }))) throw erro(400, 'Produto inválido');

  const agora = new Date();
  const inicio = iniciaEm ? new Date(iniciaEm) : agora;
  if (Number.isNaN(inicio.getTime())) throw erro(400, 'Data de início inválida');
  const terminaEm = new Date(Math.max(inicio.getTime(), agora.getTime()) + minutos * MIN);

  const leilao = await Auction.create({
    produtor: req.user.id,
    produto: produto || undefined,
    lote,
    descricao,
    quantidade,
    precoBase,
    incremento,
    // licitacaoAtual.valor começa no preço base
    licitacaoAtual: { valor: Number(precoBase) },
    iniciaEm: inicio,
    terminaEm,
    estado: inicio <= agora ? 'ativo' : 'agendado'
  });
  req.app.get('io')?.to('admins').emit('leilao-atualizado', { id: leilao._id, estado: leilao.estado });
  res.status(201).location(`/api/auctions/${leilao._id}`).json(leilao);
}));

// GET /api/auctions/:id/bids -> histórico de licitações
router.get('/:id/bids', a(async (req, res) => {
  const licitacoes = await Bid.find({ leilao: req.params.id }).sort({ createdAt: -1 }).limit(50);
  res.json(licitacoes);
}));

// GET /api/auctions/:id -> { leilao, licitacoes }
router.get('/:id', a(async (req, res) => {
  const leilao = await Auction.findById(req.params.id)
    .populate('produtor', 'nome produtor.nomeExploracao produtor.localidade')
    .populate('produto', 'nome imagemUrl preco');
  if (!leilao) throw erro(404, 'Leilão não encontrado');
  const licitacoes = await Bid.find({ leilao: leilao._id }).sort({ createdAt: -1 }).limit(20);
  res.json({ leilao, licitacoes });
}));

module.exports = router;
