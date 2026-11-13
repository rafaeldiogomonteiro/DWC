// Painel do administrador
const router = require('express').Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Auction = require('../models/Auction');
const Review = require('../models/Review');
const auth = require('../middleware/auth');
const a = require('../utils/async');
const erro = require('../utils/erro');
const { atualizarMediaProduto } = require('../services/avaliacoes');

router.use(auth('admin'));

// GET /api/admin/estatisticas
router.get('/estatisticas', a(async (req, res) => {
  const inicioDia = new Date();
  inicioDia.setHours(0, 0, 0, 0);
  const [utilizadores, produtores, produtoresPendentes, encomendasHoje, encomendasAbertas, leiloesAtivos, avaliacoesDenunciadas] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ papel: 'produtor', 'produtor.validado': true }),
    User.countDocuments({ papel: 'produtor', 'produtor.validado': false, 'produtor.rejeitado': { $ne: true } }),
    Order.countDocuments({ createdAt: { $gte: inicioDia } }),
    Order.countDocuments({ estado: { $in: ['pendente', 'confirmada', 'pronta'] } }),
    Auction.countDocuments({ estado: 'ativo' }),
    Review.countDocuments({ denuncias: { $gte: 1 }, visivel: true })
  ]);
  res.json({ utilizadores, produtores, produtoresPendentes, encomendasHoje, encomendasAbertas, leiloesAtivos, avaliacoesDenunciadas });
}));

// GET /api/admin/servicos -> estado dos serviços (API, Socket.io, MongoDB, storage, Swagger)
router.get('/servicos', (req, res) => {
  const io = req.app.get('io');
  res.json({
    api: { estado: 'ok', ambiente: process.env.NODE_ENV || 'development', uptimeSegundos: Math.round(process.uptime()) },
    socketio: { estado: io ? 'ok' : 'indisponível', ligacoes: io?.engine?.clientsCount ?? 0 },
    mongodb: { estado: mongoose.connection.readyState === 1 ? 'ok' : 'desligado', host: mongoose.connection.host },
    storage: { estado: 'ok', tipo: process.env.STORAGE_CONN ? 'Azure Blob Storage' : 'disco local (desenvolvimento)' },
    swagger: { estado: 'ok', caminho: '/api-docs' }
  });
});

// GET /api/admin/utilizadores?papel=
router.get('/utilizadores', a(async (req, res) => {
  const filtro = req.query.papel ? { papel: req.query.papel } : {};
  const lista = await User.find(filtro).select('nome email papel produtor.validado produtor.localidade createdAt').sort({ createdAt: -1 }).limit(200);
  res.json(lista);
}));

// GET /api/admin/produtores/pendentes
router.get('/produtores/pendentes', a(async (req, res) => {
  const lista = await User.find({ papel: 'produtor', 'produtor.validado': false, 'produtor.rejeitado': { $ne: true } })
    .select('nome email produtor createdAt');
  res.json(lista);
}));

// PATCH /api/admin/produtores/:id/validacao { aprovado: true | false }
router.patch('/produtores/:id/validacao', a(async (req, res) => {
  if (typeof req.body.aprovado !== 'boolean') throw erro(400, 'Indique "aprovado" (true ou false)');
  const aprovado = req.body.aprovado;
  const produtor = await User.findOneAndUpdate(
    { _id: req.params.id, papel: 'produtor' },
    { 'produtor.validado': aprovado, 'produtor.rejeitado': !aprovado },
    { new: true }
  ).select('nome email produtor');
  if (!produtor) throw erro(404, 'Produtor não encontrado');
  req.app.get('io')?.to(`user:${produtor._id}`).emit(aprovado ? 'conta-validada' : 'conta-rejeitada', {});
  res.json(produtor);
}));

// GET /api/admin/reviews/denunciadas
router.get('/reviews/denunciadas', a(async (req, res) => {
  const lista = await Review.find({ denuncias: { $gte: 1 } })
    .populate('autor', 'nome')
    .populate('produtor', 'nome')
    .populate('produto', 'nome')
    .sort({ visivel: -1, denuncias: -1 });
  res.json(lista);
}));

// PATCH /api/admin/reviews/:id { visivel } -> ocultar ou repor uma avaliação
router.patch('/reviews/:id', a(async (req, res) => {
  if (typeof req.body.visivel !== 'boolean') throw erro(400, 'Indique "visivel" (true ou false)');
  const r = await Review.findByIdAndUpdate(
    req.params.id,
    { visivel: req.body.visivel, ...(req.body.visivel ? { denuncias: 0 } : {}) },
    { new: true }
  );
  if (!r) throw erro(404, 'Avaliação não encontrada');
  await atualizarMediaProduto(r.produto);
  res.json(r);
}));

module.exports = router;
