// Mantém a média das avaliações visíveis guardada no produto
const { Types } = require('mongoose');
const Review = require('../models/Review');
const Product = require('../models/Product');

async function atualizarMediaProduto(produtoId) {
  if (!produtoId) return;
  const [r] = await Review.aggregate([
    { $match: { produto: new Types.ObjectId(String(produtoId)), visivel: true } },
    { $group: { _id: null, media: { $avg: '$classificacao' } } }
  ]);
  await Product.updateOne({ _id: produtoId }, { avaliacaoMedia: Math.round((r?.media || 0) * 10) / 10 });
}

module.exports = { atualizarMediaProduto };
