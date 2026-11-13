// Passo 6: registo e login
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');
const a = require('../utils/async');
const erro = require('../utils/erro');

function emitirToken(u) {
  return jwt.sign({ id: u._id.toString(), papel: u.papel, nome: u.nome },
    process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '2h' });
}

// POST /api/auth/registo -> 201 { id, token, utilizador }
// O papel admin nunca pode ser escolhido; um produtor novo fica por validar.
router.post('/registo', a(async (req, res) => {
  const { nome, email, password, papel, produtor: dadosProdutor, comprador: dadosComprador } = req.body;
  if (!nome?.trim() || !email?.trim() || !password) throw erro(400, 'Nome, email e password são obrigatórios');
  if (String(password).length < 6) throw erro(400, 'A password deve ter pelo menos 6 caracteres');

  const papelConta = papel === 'produtor' ? 'produtor' : 'comprador';
  const doc = {
    nome: String(nome).trim(),
    email: String(email).trim().toLowerCase(),
    passwordHash: await bcrypt.hash(String(password), 12),
    papel: papelConta
  };
  if (papelConta === 'produtor') {
    doc.produtor = {
      nomeExploracao: dadosProdutor?.nomeExploracao?.trim() || doc.nome,
      localidade: dadosProdutor?.localidade?.trim() || '',
      descricao: dadosProdutor?.descricao?.trim(),
      validado: false
    };
  } else if (dadosComprador) {
    doc.comprador = { tipo: dadosComprador.tipo, morada: dadosComprador.morada };
  }

  const u = await User.create(doc).catch((err) => {
    if (err.code === 11000) throw erro(409, 'Email já registado');
    throw err;
  });
  res.status(201).location('/api/auth/eu').json({ id: u._id, token: emitirToken(u), utilizador: u.publico() });
}));

// POST /api/auth/login -> 200 { token, utilizador }
// A mensagem é igual para email inexistente e password errada (não revela que emails existem).
router.post('/login', a(async (req, res) => {
  const { email, password } = req.body;
  const u = await User.findOne({ email: String(email || '').trim().toLowerCase() }).select('+passwordHash');
  if (!u || !(await bcrypt.compare(String(password || ''), u.passwordHash))) {
    throw erro(401, 'Credenciais inválidas');
  }
  res.json({ token: emitirToken(u), utilizador: u.publico() });
}));

// GET /api/auth/eu -> 200 dados do utilizador autenticado
router.get('/eu', auth(), a(async (req, res) => {
  const u = await User.findById(req.user.id);
  if (!u) throw erro(404, 'Utilizador não encontrado');
  res.json(u.publico());
}));

module.exports = router;
