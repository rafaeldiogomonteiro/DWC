// Utilizador: comprador (particular ou restaurante), produtor ou administrador.
// Os dados da exploração estão EMBEBIDOS (1:1, sempre lidos com o utilizador).
const { Schema, model } = require('mongoose');

const userSchema = new Schema({
  nome: { type: String, required: true, trim: true, maxlength: 100 },
  email: {
    type: String, required: true, unique: true, lowercase: true, trim: true, match: /^\S+@\S+\.\S+$/
  },
  passwordHash: { type: String, required: true, select: false },
  papel: { type: String, enum: ['comprador', 'produtor', 'admin'], default: 'comprador' },

  comprador: {
    tipo: { type: String, enum: ['particular', 'restaurante'], default: 'particular' },
    morada: String
  },

  produtor: {
    nomeExploracao: { type: String, trim: true, maxlength: 120 },
    descricao: { type: String, maxlength: 1000 },
    localidade: { type: String, trim: true },
    localizacao: { lat: { type: Number, min: -90, max: 90 }, lng: { type: Number, min: -180, max: 180 } },
    validado: { type: Boolean, default: false },
    rejeitado: { type: Boolean, default: false }
  }
}, { timestamps: true });

userSchema.index({ papel: 1, 'produtor.validado': 1 });
userSchema.index({ 'produtor.localidade': 1 });

// Dados que podem ser enviados ao cliente (nunca o hash da password)
userSchema.methods.publico = function publico() {
  return {
    id: this._id,
    nome: this.nome,
    email: this.email,
    papel: this.papel,
    ...(this.papel === 'produtor' ? { produtor: this.produtor } : {}),
    ...(this.papel === 'comprador' ? { comprador: this.comprador } : {})
  };
};

module.exports = model('User', userSchema);
