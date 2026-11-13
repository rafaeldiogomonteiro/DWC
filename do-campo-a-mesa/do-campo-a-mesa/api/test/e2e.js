// Teste de ponta a ponta da API REST e dos sockets: npm test
// Por omissão arranca uma MongoDB em memória e a API numa porta livre. Para testar uma API já
// em execução (depois do seed): API_URL=http://localhost:3000 npm test
const { io: ligar } = require('socket.io-client');

let API = process.env.API_URL;
let falhas = 0;
let total = 0;
const ok = (condicao, msg) => {
  total += 1;
  if (condicao) console.log(`  ✔ ${msg}`);
  else { falhas += 1; console.log(`  ✘ ${msg}`); }
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const emitir = (s, ev, d) => new Promise((res) => s.emit(ev, d, res));
const proximo = (s, ev, ms = 8000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout à espera de "${ev}"`)), ms);
  s.once(ev, (d) => { clearTimeout(t); res(d); });
});

async function pedido(metodo, caminho, { token, corpo } = {}) {
  const r = await fetch(`${API}/api${caminho}`, {
    method: metodo,
    headers: { ...(corpo ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  const texto = await r.text();
  return { status: r.status, headers: r.headers, corpo: texto ? JSON.parse(texto) : null };
}
const login = async (email) => (await pedido('POST', '/auth/login', { corpo: { email, password: 'password123' } })).corpo;
const socket = (token) => new Promise((res, rej) => {
  const s = ligar(API, { auth: { token }, transports: ['websocket'], forceNew: true });
  s.once('connect', () => res(s));
  s.once('connect_error', rej);
});

async function arrancarLocal() {
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri('do-campo-a-mesa-teste');
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste';
  process.env.PORT = '0';
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGODB_URI);
  await require('../src/seed/seed')({ desligar: false });
  const server = await require('../src/server')();
  API = `http://localhost:${server.address().port}`;
  return { mongo, server, mongoose };
}

async function main() {
  const local = API ? null : await arrancarLocal();
  const sockets = [];
  try {
    console.log(`\nA testar ${API}\n`);

    console.log('Autenticação e segurança');
    let r = await pedido('POST', '/auth/login', { corpo: { email: 'tasca@exemplo.pt', password: 'errada' } });
    const r2 = await pedido('POST', '/auth/login', { corpo: { email: 'nao@existe.pt', password: 'x' } });
    ok(r.status === 401 && r2.status === 401 && r.corpo.erro === r2.corpo.erro, 'login errado -> 401 com a mesma mensagem');
    const tasca = await login('tasca@exemplo.pt');
    const ana = await login('ana@exemplo.pt');
    const horta = await login('horta@exemplo.pt');
    const mel = await login('mel@exemplo.pt');
    const admin = await login('admin@exemplo.pt');
    ok(tasca.token && !JSON.stringify(tasca).includes('passwordHash'), 'login devolve token e nunca o hash da password');
    r = await pedido('GET', '/orders');
    ok(r.status === 401, 'sem token -> 401');
    r = await pedido('POST', '/products', { token: tasca.token, corpo: { nome: 'X' } });
    ok(r.status === 403, 'comprador numa rota de produtor -> 403');
    const email = `novo_${Date.now()}@exemplo.pt`;
    r = await pedido('POST', '/auth/registo', { corpo: { nome: 'Produtor Novo', email, password: 'segredo1', papel: 'produtor', produtor: { localidade: 'Viana do Castelo' } } });
    ok(r.status === 201 && r.corpo.token && r.corpo.utilizador.papel === 'produtor', 'registo de produtor -> 201 com token');
    const novoProdutor = r.corpo;
    r = await pedido('POST', '/auth/registo', { corpo: { nome: 'Outro', email, password: 'segredo1' } });
    ok(r.status === 409, 'email repetido -> 409');
    r = await pedido('POST', '/auth/registo', { corpo: { nome: 'Hacker', email: `adm_${Date.now()}@x.pt`, password: 'segredo1', papel: 'admin' } });
    ok(r.status === 201 && r.corpo.utilizador.papel === 'comprador', 'não é possível registar-se como admin');
    r = await pedido('POST', '/products', { token: novoProdutor.token, corpo: { nome: 'Teste', categoria: 'Mel', preco: 1 } });
    ok(r.status === 403, 'produtor por validar não pode publicar produtos -> 403');

    console.log('Produtos e pesquisa');
    r = await pedido('GET', '/products?q=mel&categoria=Mel');
    ok(r.status === 200 && r.corpo.length === 2, 'pesquisa $regex + categoria devolve 2 méis');
    r = await pedido('GET', '/products?precoMax=2&ordenacao=preco_asc');
    ok(r.corpo.length > 0 && r.corpo.every((p, i, l) => p.preco <= 2 && (i === 0 || l[i - 1].preco <= p.preco)), 'filtro $lte e ordenação por preço');
    r = await pedido('GET', '/products?q=caldo');
    ok(r.corpo.some((p) => p.nome === 'Couve-galega'), 'pesquisa por ingrediente (descrição)');
    r = await pedido('GET', '/products?q=soajo');
    ok(r.corpo.length === 2, 'pesquisa pelo nome do produtor');
    r = await pedido('GET', '/products?localidade=Monção');
    ok(r.corpo.length === 2 && r.corpo.every((p) => p.produtor.produtor.localidade === 'Monção'), 'filtro por localidade');
    r = await pedido('GET', '/products?q=(');
    ok(r.status === 200, 'texto com caracteres especiais não rebenta o $regex');
    r = await pedido('GET', '/products/abc');
    ok(r.status === 400, 'id inválido -> 400 (não 500)');
    r = await pedido('POST', '/products', { token: horta.token, corpo: { nome: 'X', preco: 1 } });
    ok(r.status === 400 && r.corpo.detalhes?.categoria, 'produto sem categoria -> 400 com o campo em detalhes');
    r = await pedido('POST', '/products', { token: horta.token, corpo: { nome: 'Pimento', categoria: 'Hortícolas', preco: 2, stock: 50, avaliacaoMedia: 5, produtor: mel.utilizador.id } });
    ok(r.status === 201 && r.headers.get('location') === `/api/products/${r.corpo._id}`, 'criar produto -> 201 + Location');
    ok(r.corpo.produtor === horta.utilizador.id && r.corpo.avaliacaoMedia === 0, 'mass assignment bloqueado (produtor e média ignorados)');
    const pimento = r.corpo;
    r = await pedido('PUT', `/products/${pimento._id}`, { token: mel.token, corpo: { preco: 0.01 } });
    ok(r.status === 404, 'outro produtor não pode alterar -> 404');
    r = await pedido('PUT', `/products/${pimento._id}`, { token: horta.token, corpo: { preco: -1 } });
    ok(r.status === 400, 'update respeita o schema (preço >= 0)');

    console.log('Encomendas e notificações');
    r = await pedido('POST', '/orders', { token: tasca.token, corpo: { linhas: [{ produto: pimento._id, quantidade: 2 }, { produto: pimento._id, quantidade: 999 }] } });
    const depois = (await pedido('GET', `/products/${pimento._id}`)).corpo.stock;
    ok(r.status === 409 && depois === 50, 'stock insuficiente -> 409 e stock reservado é reposto');
    const sHorta = await socket(horta.token);
    const sTasca = await socket(tasca.token);
    sockets.push(sHorta, sTasca);
    const avisoProdutor = proximo(sHorta, 'nova-encomenda');
    const melUrze = (await pedido('GET', '/products?q=urze')).corpo[0];
    r = await pedido('POST', '/orders', { token: tasca.token, corpo: { linhas: [{ produto: pimento._id, quantidade: 2 }, { produto: melUrze._id, quantidade: 1 }], entrega: { tipo: 'levantamento' } } });
    ok(r.status === 201 && r.corpo.length === 2, 'carrinho com 2 produtores -> 2 encomendas');
    const encomenda = r.corpo.find((o) => o.produtor === horta.utilizador.id);
    ok(encomenda.total === 4 && encomenda.linhas[0].precoUnit === 2, 'linhas guardam cópia do preço e o total');
    ok((await pedido('GET', `/products/${pimento._id}`)).corpo.stock === 48, 'stock reservado (50 -> 48)');
    ok(!!(await avisoProdutor.catch(() => null)), 'produtor recebe notificação de nova encomenda');
    const notificacao = proximo(sTasca, 'encomenda-atualizada');
    r = await pedido('PATCH', `/orders/${encomenda._id}/estado`, { token: horta.token, corpo: { estado: 'confirmada' } });
    ok(r.status === 200 && r.corpo.estado === 'confirmada', 'produtor muda o estado -> 200');
    const n = await notificacao.catch(() => null);
    ok(n?.estado === 'confirmada', 'comprador recebe notificação em tempo real');
    r = await pedido('PATCH', `/orders/${encomenda._id}/estado`, { token: horta.token, corpo: { estado: 'pendente' } });
    ok(r.status === 409, 'estado não pode recuar -> 409');
    r = await pedido('PATCH', `/orders/${encomenda._id}/estado`, { token: mel.token, corpo: { estado: 'pronta' } });
    ok(r.status === 404, 'outro produtor não muda a encomenda -> 404');
    r = await pedido('PATCH', `/orders/${encomenda._id}/estado`, { token: horta.token, corpo: { estado: 'voando' } });
    ok(r.status === 400, 'estado inválido -> 400');

    console.log('Avaliações');
    r = await pedido('POST', '/reviews', { token: tasca.token, corpo: { encomenda: encomenda._id, classificacao: 5 } });
    ok(r.status === 409, 'não avalia antes de entregue -> 409');
    await pedido('PATCH', `/orders/${encomenda._id}/estado`, { token: horta.token, corpo: { estado: 'entregue' } });
    r = await pedido('POST', '/reviews', { token: tasca.token, corpo: { encomenda: encomenda._id, produto: pimento._id, classificacao: 4, comentario: 'Bom' } });
    ok(r.status === 201, 'avaliação depois de entregue -> 201');
    const review = r.corpo;
    ok((await pedido('GET', `/products/${pimento._id}`)).corpo.avaliacaoMedia === 4, 'média do produto atualizada');
    r = await pedido('POST', '/reviews', { token: tasca.token, corpo: { encomenda: encomenda._id, classificacao: 3 } });
    ok(r.status === 409, 'não avalia duas vezes -> 409');

    console.log('Estatísticas e página pública do produtor');
    r = await pedido('GET', '/producers/eu/estatisticas', { token: horta.token });
    ok(r.status === 200 && r.corpo.numEncomendas >= 3 && r.corpo.stockBaixo.some((p) => p.nome === 'Couve-galega'), 'estatísticas de vendas e alerta de stock baixo');
    r = await pedido('PUT', '/producers/eu', { token: horta.token, corpo: { descricao: 'Nova descrição' } });
    ok(r.status === 200 && r.corpo.produtor.descricao === 'Nova descrição', 'produtor edita a página pública');

    console.log('Leilões em tempo real');
    r = await pedido('POST', '/auctions', { token: horta.token, corpo: { lote: 'Lote de teste', precoBase: 100, incremento: 5, duracaoMinutos: 10 } });
    ok(r.status === 201 && r.corpo.licitacaoAtual.valor === 100 && r.corpo.estado === 'ativo', 'criar leilão -> 201, licitação atual = preço base');
    const leilao = r.corpo;
    const sAna = await socket(ana.token);
    const sAdmin = await socket(admin.token);
    sockets.push(sAna, sAdmin);
    let estado = proximo(sTasca, 'estado');
    sTasca.emit('entrar', leilao._id);
    estado = await estado;
    ok(estado.leilao._id === leilao._id && estado.agora, 'ao entrar recebe estado e relógio do servidor');
    const presenca = proximo(sTasca, 'presenca');
    sAna.emit('entrar', leilao._id);
    ok((await presenca) === 2, 'presença: 2 a assistir');
    await proximo(sAna, 'estado');
    r = await emitir(sTasca, 'licitar', { leilaoId: leilao._id, valor: 102 });
    ok(r.ok === false && /105/.test(r.erro), 'licitação abaixo do mínimo é recusada');
    r = await emitir(sHorta, 'licitar', { leilaoId: leilao._id, valor: 500 });
    ok(r.ok === false, 'produtor não pode licitar');
    const vistaPelaAna = proximo(sAna, 'nova-licitacao');
    const vistaPeloAdmin = proximo(sAdmin, 'leilao-atualizado');
    const [x, y] = await Promise.all([
      emitir(sAna, 'licitar', { leilaoId: leilao._id, valor: 105 }),
      emitir(sTasca, 'licitar', { leilaoId: leilao._id, valor: 105 })
    ]);
    ok([x, y].filter((z) => z.ok).length === 1, 'duas licitações simultâneas de 105 €: só UMA é aceite');
    ok((await vistaPelaAna).valor === 105, 'broadcast da licitação aceite à sala');
    ok(!!(await vistaPeloAdmin.catch(() => null)), 'administrador acompanha o leilão em tempo real');
    const rajada = await Promise.all(Array.from({ length: 10 }, (_, i) => emitir(i % 2 ? sAna : sTasca, 'licitar', { leilaoId: leilao._id, valor: 110 + (i % 3) * 5 })));
    const bids = (await pedido('GET', `/auctions/${leilao._id}/bids`)).corpo;
    ok(rajada.filter((z) => z.ok).length + 1 === bids.length, 'rajada de 10: aceites = registadas');
    const ordem = [...bids].reverse();
    ok(ordem.every((b, i) => i === 0 || b.valor >= ordem[i - 1].valor + 5), 'cada licitação aceite >= anterior + incremento');
    const saiu = proximo(sTasca, 'presenca');
    sAna.disconnect();
    ok((await saiu) === 1, 'presença baixa quando alguém sai');

    if (local) {
      const Auction = require('../src/models/Auction');
      const vencedorAntes = (await Auction.findById(leilao._id)).licitacaoAtual;
      const terminado = proximo(sTasca, 'terminado', 10000);
      await Auction.updateOne({ _id: leilao._id }, { terminaEm: new Date(Date.now() - 1000) });
      const fim = await terminado.catch(() => null);
      ok(fim?.valor === vencedorAntes.valor, 'leilão fecha e anuncia o vencedor à sala');
      await esperar(300);
      const doVencedor = (await pedido('GET', '/orders', { token: vencedorAntes.nome === 'Ana Ribeiro' ? ana.token : tasca.token })).corpo;
      ok(doVencedor.some((o) => o.origem === 'leilao' && o.total === vencedorAntes.valor), 'vencedor recebe encomenda do lote');
      r = await emitir(sTasca, 'licitar', { leilaoId: leilao._id, valor: 999 });
      ok(r.ok === false, 'leilão terminado não aceita licitações');
    }

    console.log('Administração');
    r = await pedido('GET', '/admin/estatisticas', { token: tasca.token });
    ok(r.status === 403, 'comprador não acede ao painel admin -> 403');
    r = await pedido('GET', '/admin/produtores/pendentes', { token: admin.token });
    ok(r.corpo.some((p) => p.email === email), 'novo produtor aparece por validar');
    r = await pedido('PATCH', `/admin/produtores/${novoProdutor.id}/validacao`, { token: admin.token, corpo: { aprovado: true } });
    ok(r.status === 200 && r.corpo.produtor.validado, 'admin aprova produtor');
    r = await pedido('POST', '/products', { token: novoProdutor.token, corpo: { nome: 'Teste', categoria: 'Mel', preco: 1 } });
    ok(r.status === 201, 'produtor aprovado já publica produtos');
    await pedido('POST', `/reviews/${review._id}/denuncia`, { token: ana.token });
    r = await pedido('PATCH', `/admin/reviews/${review._id}`, { token: admin.token, corpo: { visivel: false } });
    ok(r.status === 200 && r.corpo.visivel === false, 'admin oculta avaliação');
    ok((await pedido('GET', `/products/${pimento._id}`)).corpo.avaliacaoMedia === 0, 'média recalculada sem a avaliação oculta');
    r = await pedido('GET', '/admin/servicos', { token: admin.token });
    ok(r.status === 200 && r.corpo.mongodb.estado === 'ok', 'estado dos serviços');

    console.log('Diversos');
    ok((await pedido('GET', '/nao-existe')).status === 404, 'rota inexistente -> 404');
    ok((await fetch(`${API}/api-docs/`)).ok, 'Swagger UI em /api-docs');
    r = await pedido('DELETE', `/products/${pimento._id}`, { token: horta.token });
    ok(r.status === 204, 'remover produto -> 204');
  } finally {
    sockets.forEach((s) => s.disconnect());
    if (local) {
      local.server.close();
      await local.mongoose.disconnect();
      await local.mongo.stop();
    }
  }

  console.log(`\n${falhas ? `${falhas} verificação(ões) falharam` : 'Todos os testes passaram'} · ${total - falhas} / ${total}`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
