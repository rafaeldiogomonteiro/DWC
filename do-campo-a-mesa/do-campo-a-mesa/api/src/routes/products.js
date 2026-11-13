// Passo 3: recurso /api/products
const router = require('express').Router();
const multer = require('multer');
const Product = require('../models/Product');
const User = require('../models/User');
const auth = require('../middleware/auth');
const produtorValidado = require('../middleware/produtorValidado');
const { guardarImagem } = require('../services/imagens');
const a = require('../utils/async');
const erro = require('../utils/erro');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Só estes campos podem vir do cliente (proteção contra mass assignment: produtor, imagemUrl e
// avaliacaoMedia são geridos pelo servidor)
const CAMPOS = ['nome', 'descricao', 'categoria', 'preco', 'unidade', 'stock', 'biologico', 'epocas'];
const escolher = (obj) => Object.fromEntries(CAMPOS.filter((c) => obj[c] !== undefined).map((c) => [c, obj[c]]));
const escaparRegex = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ORDENACOES = {
  nome: { nome: 1 },
  preco_asc: { preco: 1 },
  preco_desc: { preco: -1 },
  recentes: { createdAt: -1 }
};

// GET /api/products?q=&categoria=&precoMax=&precoMin=&bio=&epoca=&produtor=&localidade=&ordenacao=
router.get('/', a(async (req, res) => {
  const { q, categoria, precoMax, precoMin, bio, epoca, produtor, localidade, ordenacao } = req.query;
  const filtro = {};

  // Pesquisa por nome, ingrediente (descrição) ou nome do produtor
  if (q) {
    const re = { $regex: escaparRegex(q), $options: 'i' };
    const produtoresComNome = await User.find({ papel: 'produtor', $or: [{ nome: re }, { 'produtor.nomeExploracao': re }] }).select('_id');
    filtro.$or = [{ nome: re }, { descricao: re }, { produtor: { $in: produtoresComNome.map((u) => u._id) } }];
  }
  if (categoria && categoria !== 'Todos') filtro.categoria = categoria;
  if (precoMax || precoMin) {
    filtro.preco = {};
    if (precoMax) filtro.preco.$lte = Number(precoMax);
    if (precoMin) filtro.preco.$gte = Number(precoMin);
  }
  if (bio === 'true') filtro.biologico = true;
  if (epoca) filtro.epocas = { $in: [epoca] };

  if (produtor) {
    filtro.produtor = produtor;
  } else {
    // O catálogo público só mostra produtos de produtores validados (opcionalmente de uma localidade)
    const fp = { papel: 'produtor', 'produtor.validado': true };
    if (localidade) fp['produtor.localidade'] = { $regex: escaparRegex(localidade), $options: 'i' };
    const ids = (await User.find(fp).select('_id')).map((u) => u._id);
    filtro.produtor = { $in: ids };
  }

  const lista = await Product.find(filtro)
    .sort(ORDENACOES[ordenacao] || ORDENACOES.nome)
    .populate('produtor', 'nome produtor.localidade produtor.nomeExploracao');
  res.json(lista);
}));

// GET /api/products/:id
router.get('/:id', a(async (req, res) => {
  const produto = await Product.findById(req.params.id).populate('produtor', 'nome produtor.localidade produtor.nomeExploracao');
  if (!produto) throw erro(404, 'Produto não encontrado');
  res.json(produto);
}));

// POST /api/products (produtor validado) -> 201 + Location
router.post('/', auth('produtor'), produtorValidado, a(async (req, res) => {
  const p = await Product.create({ ...escolher(req.body), produtor: req.user.id });
  res.status(201).location(`/api/products/${p._id}`).json(p);
}));

// PUT /api/products/:id (produtor dono) -> 200 | 404
// Se o produto for de outro produtor responde 404 (não revela que existe).
router.put('/:id', auth('produtor'), a(async (req, res) => {
  const p = await Product.findOneAndUpdate(
    { _id: req.params.id, produtor: req.user.id },
    escolher(req.body),
    { new: true, runValidators: true }
  );
  if (!p) throw erro(404, 'Produto não encontrado');
  res.json(p);
}));

// DELETE /api/products/:id (produtor dono) -> 204 | 404
router.delete('/:id', auth('produtor'), a(async (req, res) => {
  const r = await Product.deleteOne({ _id: req.params.id, produtor: req.user.id });
  if (!r.deletedCount) throw erro(404, 'Produto não encontrado');
  res.status(204).end();
}));

// POST /api/products/:id/imagem (multipart, campo "imagem") -> 200 { imagemUrl }
router.post('/:id/imagem', auth('produtor'), upload.single('imagem'), a(async (req, res) => {
  const produto = await Product.findOne({ _id: req.params.id, produtor: req.user.id });
  if (!produto) throw erro(404, 'Produto não encontrado');
  if (!req.file) throw erro(400, 'Campo "imagem" em falta');
  produto.imagemUrl = await guardarImagem(req.file);
  await produto.save();
  res.json({ imagemUrl: produto.imagemUrl });
}));

module.exports = router;
