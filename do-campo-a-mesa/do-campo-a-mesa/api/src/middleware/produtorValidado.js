// Só deixa passar produtores cuja conta já foi aprovada pelo administrador
const User = require('../models/User');

module.exports = async (req, res, next) => {
  try {
    const u = await User.findById(req.user.id);
    if (!u?.produtor?.validado) {
      return res.status(403).json({ erro: 'Conta de produtor a aguardar validação do administrador' });
    }
    next();
  } catch (err) { next(err); }
};
