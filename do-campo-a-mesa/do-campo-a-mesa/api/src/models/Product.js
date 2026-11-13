// Produto: o produtor é REFERENCIADO (um produtor tem muitos produtos e os seus dados mudam)
const { Schema, model, Types } = require('mongoose');

const CATEGORIAS = ['Hortícolas', 'Fruta', 'Mel', 'Vinho', 'Queijo', 'Padaria', 'Outros'];
const EPOCAS = ['Primavera', 'Verão', 'Outono', 'Inverno'];

const productSchema = new Schema({
  produtor: { type: Types.ObjectId, ref: 'User', required: true },
  nome: { type: String, required: true, trim: true, maxlength: 120 },
  descricao: { type: String, maxlength: 1000 },
  categoria: { type: String, enum: CATEGORIAS, required: true },
  preco: { type: Number, required: true, min: 0 },
  unidade: { type: String, default: 'kg', trim: true },
  stock: { type: Number, default: 0, min: 0 },
  biologico: { type: Boolean, default: false },
  epocas: [{ type: String, enum: EPOCAS }],
  imagemUrl: String,
  avaliacaoMedia: { type: Number, default: 0, min: 0, max: 5 }
}, { timestamps: true });

productSchema.index({ categoria: 1, preco: 1 });
productSchema.index({ produtor: 1 });

productSchema.statics.CATEGORIAS = CATEGORIAS;
productSchema.statics.EPOCAS = EPOCAS;

module.exports = model('Product', productSchema);
