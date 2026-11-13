// Dados de exemplo: npm run seed   (APAGA as coleções antes de inserir)
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const Review = require('../models/Review');

const MIN = 60 * 1000;

async function seed({ desligar = true } = {}) {
  if (mongoose.connection.readyState !== 1) await mongoose.connect(process.env.MONGODB_URI);
  await Promise.all([User, Product, Order, Auction, Bid, Review].map((M) => M.deleteMany()));
  await Promise.all([User, Product, Order, Auction, Bid, Review].map((M) => M.syncIndexes()));

  const passwordHash = await bcrypt.hash('password123', 12);
  const [admin, horta, mel, quinta, pendente, tasca, ana] = await User.create([
    { nome: 'Administração', email: 'admin@exemplo.pt', passwordHash, papel: 'admin' },
    { nome: 'Horta da Ribeira', email: 'horta@exemplo.pt', passwordHash, papel: 'produtor',
      produtor: {
        nomeExploracao: 'Horta da Ribeira', localidade: 'Ponte de Lima',
        descricao: 'Hortícolas e fruta sazonal do vale do Lima, em modo biológico desde 2012.',
        localizacao: { lat: 41.7675, lng: -8.5839 }, validado: true
      } },
    { nome: 'Mel do Soajo', email: 'mel@exemplo.pt', passwordHash, papel: 'produtor',
      produtor: {
        nomeExploracao: 'Mel do Soajo', localidade: 'Arcos de Valdevez',
        descricao: 'Apicultura de montanha no Parque Nacional da Peneda-Gerês.',
        localizacao: { lat: 41.8725, lng: -8.2639 }, validado: true
      } },
    { nome: 'Quinta do Alvarinho', email: 'quinta@exemplo.pt', passwordHash, papel: 'produtor',
      produtor: {
        nomeExploracao: 'Quinta do Alvarinho', localidade: 'Monção',
        descricao: 'Vinho Alvarinho e queijo de cabra da sub-região de Monção e Melgaço.',
        localizacao: { lat: 42.0786, lng: -8.4806 }, validado: true
      } },
    { nome: 'Queijaria da Serra', email: 'queijaria@exemplo.pt', passwordHash, papel: 'produtor',
      produtor: { nomeExploracao: 'Queijaria da Serra', localidade: 'Melgaço', validado: false } },
    { nome: 'Tasca do Lima', email: 'tasca@exemplo.pt', passwordHash, papel: 'comprador', comprador: { tipo: 'restaurante', morada: 'Largo de Camões, Ponte de Lima' } },
    { nome: 'Ana Ribeiro', email: 'ana@exemplo.pt', passwordHash, papel: 'comprador' }
  ]);

  const [kiwi, abobora, couve, melUrze, melCastanheiro, alvarinho, queijo] = await Product.create([
    { produtor: horta._id, nome: 'Kiwi Hayward', descricao: 'Kiwi de calibre A colhido em outubro.', categoria: 'Fruta', preco: 2.4, unidade: 'kg', stock: 300, biologico: true, epocas: ['Outono', 'Inverno'] },
    { produtor: horta._id, nome: 'Abóbora-menina', descricao: 'Ideal para sopas e doce de abóbora.', categoria: 'Hortícolas', preco: 1.2, unidade: 'kg', stock: 80, epocas: ['Outono'] },
    { produtor: horta._id, nome: 'Couve-galega', descricao: 'Para o caldo verde.', categoria: 'Hortícolas', preco: 1.5, unidade: 'molho', stock: 6, biologico: true, epocas: ['Outono', 'Inverno'] },
    { produtor: mel._id, nome: 'Mel de urze', descricao: 'Mel escuro de urze, sabor intenso.', categoria: 'Mel', preco: 7.5, unidade: '500 g', stock: 38, epocas: ['Verão', 'Outono'] },
    { produtor: mel._id, nome: 'Mel de castanheiro', descricao: 'Mel de flor de castanheiro.', categoria: 'Mel', preco: 7.0, unidade: '500 g', stock: 21, epocas: ['Verão'] },
    { produtor: quinta._id, nome: 'Alvarinho 2024', descricao: 'Vinho verde branco, casta Alvarinho.', categoria: 'Vinho', preco: 12.5, unidade: 'garrafa', stock: 60, epocas: ['Primavera', 'Verão', 'Outono', 'Inverno'] },
    { produtor: quinta._id, nome: 'Queijo de cabra curado', descricao: 'Leite cru de cabra, cura de 60 dias.', categoria: 'Queijo', preco: 9.0, unidade: 'unidade', stock: 15, biologico: true, epocas: ['Primavera', 'Verão'] }
  ]);

  // Encomendas em vários estados (preço e nome copiados para as linhas)
  const linha = (p, quantidade) => ({ produto: p._id, nome: p.nome, precoUnit: p.preco, unidade: p.unidade, quantidade });
  const [entregue] = await Order.create([
    { comprador: tasca._id, produtor: horta._id, linhas: [linha(kiwi, 10), linha(abobora, 5)], estado: 'entregue',
      entrega: { tipo: 'entrega', morada: 'Largo de Camões, Ponte de Lima' },
      historicoEstados: ['pendente', 'confirmada', 'pronta', 'entregue'].map((estado) => ({ estado })) },
    { comprador: tasca._id, produtor: mel._id, linhas: [linha(melUrze, 2)], estado: 'pendente' },
    { comprador: ana._id, produtor: horta._id, linhas: [linha(couve, 2)], estado: 'confirmada',
      historicoEstados: [{ estado: 'pendente' }, { estado: 'confirmada' }] },
    { comprador: ana._id, produtor: quinta._id, linhas: [linha(alvarinho, 3), linha(queijo, 1)], estado: 'entregue',
      historicoEstados: ['pendente', 'confirmada', 'pronta', 'entregue'].map((estado) => ({ estado })) }
  ]);

  await Review.create([
    { autor: tasca._id, produtor: horta._id, produto: kiwi._id, encomenda: entregue._id, classificacao: 5, comentario: 'Kiwis excelentes, chegaram no ponto.' },
    { autor: ana._id, produtor: quinta._id, classificacao: 1, comentario: 'Comentário ofensivo de teste para moderação.', denuncias: 2 }
  ]);
  await Product.updateOne({ _id: kiwi._id }, { avaliacaoMedia: 5 });

  const agora = Date.now();
  await Auction.create([
    { produtor: horta._id, produto: kiwi._id, lote: '200 kg de kiwi Hayward, calibre A', quantidade: '200 kg',
      descricao: 'Excedente da colheita de outubro, em caixas de 10 kg.',
      precoBase: 200, incremento: 5, licitacaoAtual: { valor: 200 },
      iniciaEm: new Date(agora), terminaEm: new Date(agora + 30 * MIN), estado: 'ativo' },
    { produtor: mel._id, produto: melUrze._id, lote: '40 frascos de mel de urze', quantidade: '40 × 500 g',
      precoBase: 150, incremento: 10, licitacaoAtual: { valor: 150 },
      iniciaEm: new Date(agora + 60 * MIN), terminaEm: new Date(agora + 90 * MIN), estado: 'agendado' }
  ]);

  const utilizadores = [admin, horta, mel, quinta, pendente, tasca, ana];
  console.log('Seed concluído. Utilizadores (password: password123):');
  console.log(utilizadores.map((u) => `  ${u.papel.padEnd(10)} ${u.email}${u.papel === 'produtor' && !u.produtor.validado ? ' (por validar)' : ''}`).join('\n'));
  if (desligar) await mongoose.disconnect();
}

module.exports = seed;

if (require.main === module) {
  seed().catch((err) => { console.error(err); process.exit(1); });
}
