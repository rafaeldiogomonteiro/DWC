// Encomenda: as LINHAS são embebidas (lidas sempre com a encomenda e com o preço congelado
// no momento da compra); comprador e produtor são REFERENCIADOS.
const { Schema, model, Types } = require('mongoose');

const ESTADOS = ['pendente', 'confirmada', 'pronta', 'entregue'];

const orderSchema = new Schema({
  comprador: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  produtor: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  linhas: {
    type: [{
      produto: { type: Types.ObjectId, ref: 'Product' },
      nome: { type: String, required: true },
      precoUnit: { type: Number, required: true, min: 0 },
      unidade: String,
      quantidade: { type: Number, required: true, min: 1 }
    }],
    validate: [(v) => v.length > 0, 'A encomenda tem de ter pelo menos uma linha']
  },
  total: { type: Number, default: 0, min: 0 },
  estado: { type: String, enum: ESTADOS, default: 'pendente' },
  entrega: {
    tipo: { type: String, enum: ['levantamento', 'entrega'], default: 'levantamento' },
    morada: String
  },
  origem: { type: String, enum: ['loja', 'leilao'], default: 'loja' },
  leilao: { type: Types.ObjectId, ref: 'Auction' },
  historicoEstados: [{
    estado: { type: String, enum: ESTADOS },
    em: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

orderSchema.pre('save', function calcularTotal() {
  this.total = Math.round(this.linhas.reduce((s, l) => s + l.precoUnit * l.quantidade, 0) * 100) / 100;
  if (this.isNew && !this.historicoEstados.length) this.historicoEstados.push({ estado: this.estado });
});

orderSchema.statics.ESTADOS = ESTADOS;

module.exports = model('Order', orderSchema);
