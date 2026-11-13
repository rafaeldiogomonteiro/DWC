// Avaliações em coleção própria (consultadas por produtor e moderadas pelo administrador de forma
// independente); o produto guarda apenas a média.
const { Schema, model, Types } = require('mongoose');

const reviewSchema = new Schema({
  autor: { type: Types.ObjectId, ref: 'User', required: true },
  produtor: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  produto: { type: Types.ObjectId, ref: 'Product', index: true },
  encomenda: { type: Types.ObjectId, ref: 'Order' },
  classificacao: { type: Number, min: 1, max: 5, required: true },
  comentario: { type: String, maxlength: 1000 },
  denuncias: { type: Number, default: 0, min: 0 },
  visivel: { type: Boolean, default: true }
}, { timestamps: true });

// Um comprador avalia cada encomenda uma única vez
reviewSchema.index({ encomenda: 1, autor: 1 }, { unique: true, partialFilterExpression: { encomenda: { $exists: true } } });

module.exports = model('Review', reviewSchema);
