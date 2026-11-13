/**
 * Vistoria: arranca API+SPA, testa REST e fluxos Playwright.
 * node scripts/testar-tudo.mjs
 */
import { chromium } from 'playwright';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const procs = [];

function portaLivre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close((e) => (e ? reject(e) : resolve(port)));
    });
    s.on('error', reject);
  });
}

function iniciar(cwd, args, extraEnv = {}) {
  const cmd = process.platform === 'win32'
    ? ['cmd.exe', '/d', '/s', '/c', `npm ${args.join(' ')}`]
    : ['npm', ...args];
  const p = spawn(cmd[0], cmd.slice(1), {
    cwd, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv }, windowsHide: true
  });
  procs.push(p);
  return p;
}

function terminar() {
  for (const p of procs) {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(p.pid), '/T', '/F'], { shell: true });
      else p.kill('SIGTERM');
    } catch { /* */ }
  }
}

async function aguardar(fn, ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await fn()) return; } catch { /* */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Timeout');
}

const falhas = [];
let sucessos = 0;
const ok = (msg) => { sucessos += 1; console.log('  ✓', msg); };
const fail = (msg, err) => {
  console.log('  ✗', msg, err ? `— ${err}` : '');
  falhas.push(`${msg}: ${err || ''}`);
};

async function auth(email, password, API) {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const PORT_WEB = await portaLivre();
const PORT_API = await portaLivre();
const BASE = `http://localhost:${PORT_WEB}`;
const API = `http://localhost:${PORT_API}`;

console.log('\n=== ARRANQUE ===');
iniciar(path.join(ROOT, 'api'), ['run', 'dev:memoria'], {
  PORT: String(PORT_API), CLIENT_URL: BASE
});
iniciar(path.join(ROOT, 'web'), ['run', 'dev', '--', '--port', String(PORT_WEB), '--strictPort'], {
  VITE_API_URL: API
});

await aguardar(async () => {
  const h = await fetch(`${API}/api/health`);
  return h.ok && (await h.json()).estado === 'ok';
});
await aguardar(async () => {
  const r = await fetch(BASE);
  return r.ok && (await r.text()).includes('root');
});
await aguardar(async () => {
  const r = await fetch(`${API}/api/products`);
  const j = await r.json();
  return Array.isArray(j) && j.length >= 1;
});
ok(`API ${API} · SPA ${BASE}`);

console.log('\n=== API REST ===');

try {
  const adminSem = await fetch(`${API}/api/admin/estatisticas`);
  if (adminSem.status === 401) ok('Admin bloqueado sem token');
  else fail('Admin sem token devia dar 401', adminSem.status);
} catch (e) { fail('Admin sem token', e.message); }

let adminTok, compradorTok, produtorTok, produtorId, compradorId;
try {
  const admin = await auth('admin@exemplo.pt', 'password123', API);
  const comprador = await auth('tasca@exemplo.pt', 'password123', API);
  const produtor = await auth('horta@exemplo.pt', 'password123', API);
  adminTok = admin.token;
  compradorTok = comprador.token;
  produtorTok = produtor.token;
  produtorId = String(produtor.utilizador.id);
  compradorId = String(comprador.utilizador.id);
  ok('Login admin/comprador/produtor');
} catch (e) { fail('Login seed users', e.message); }

try {
  const r = await fetch(`${API}/api/products?categoria=Fruta`);
  const p = await r.json();
  if (r.ok && p.length) ok(`GET /products (${p.length} itens)`);
  else fail('GET /products');
} catch (e) { fail('GET /products', e.message); }

try {
  const r = await fetch(`${API}/api/producers`);
  const lista = await r.json();
  if (r.ok && lista.length >= 1) ok('GET /producers');
  else fail('GET /producers');
} catch (e) { fail('GET /producers', e.message); }

let productId;
try {
  const det = await fetch(`${API}/api/producers/${produtorId}`);
  if (det.ok) ok('GET /producers/:id');
  productId = (await det.json()).produtos?.[0]?._id;
  if (!productId) {
    const prods = await fetch(`${API}/api/products?produtor=${produtorId}`);
    productId = (await prods.json())[0]?._id;
  }
} catch (e) { fail('GET /producers/:id', e.message); }

try {
  const r = await fetch(`${API}/api/auctions?estado=ativo`);
  const leiloes = await r.json();
  if (r.ok && leiloes.length) ok('GET /auctions ativo');
  else fail('GET /auctions');
} catch (e) { fail('GET /auctions', e.message); }

const auctionId = (await (await fetch(`${API}/api/auctions?estado=ativo`)).json())[0]?._id;

let orderIdForReview;
if (compradorTok && productId && produtorId) {
  try {
    const r = await fetch(`${API}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${compradorTok}`
      },
      body: JSON.stringify({
        linhas: [{ produto: productId, quantidade: 1 }],
        entrega: { tipo: 'levantamento' }
      })
    });
    const [ord] = await r.json();
    if (r.status === 201 && ord._id) {
      ok('POST /orders');
      orderIdForReview = ord._id;
      for (const estado of ['confirmada', 'pronta', 'entregue']) {
        const st = await fetch(`${API}/api/orders/${ord._id}/estado`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${produtorTok}`
          },
          body: JSON.stringify({ estado })
        });
        if (!st.ok) throw new Error(`estado ${estado}: ${st.status}`);
      }
      ok('PATCH /orders estados até entregue');
    } else fail('POST /orders', JSON.stringify(ord));
  } catch (e) { fail('Orders flow', e.message); }
}

try {
  const r = await fetch(`${API}/api/auth/eu`, { headers: { Authorization: `Bearer ${compradorTok}` } });
  if (r.ok && (await r.json()).email) ok('GET /auth/eu');
  else fail('GET /auth/eu', r.status);
} catch (e) { fail('GET /auth/eu', e.message); }

if (productId) {
  try {
    const r = await fetch(`${API}/api/products/${productId}`);
    if (r.ok) ok('GET /products/:id');
    else fail('GET /products/:id', r.status);
  } catch (e) { fail('GET /products/:id', e.message); }
}

let novoProdutoId;
if (produtorTok) {
  try {
    const criar = await fetch(`${API}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${produtorTok}`
      },
      body: JSON.stringify({
        nome: 'Teste API Queijo',
        categoria: 'Queijo',
        preco: 4.5,
        unidade: 'kg',
        stock: 5
      })
    });
    const prod = await criar.json();
    if (criar.status === 201 && prod._id) {
      novoProdutoId = prod._id;
      ok('POST /products (produtor)');
      const upd = await fetch(`${API}/api/products/${novoProdutoId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${produtorTok}`
        },
        body: JSON.stringify({ nome: 'Teste API Queijo (editado)', preco: 4.8 })
      });
      if (upd.ok) ok('PUT /products/:id');
      else fail('PUT /products', upd.status);
      const jpeg1x1 = Buffer.from(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=',
        'base64'
      );
      const fd = new FormData();
      fd.append('imagem', new Blob([jpeg1x1], { type: 'image/jpeg' }), 'test.jpg');
      const img = await fetch(`${API}/api/products/${novoProdutoId}/imagem`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${produtorTok}` },
        body: fd
      });
      if (img.ok) ok('POST /products/:id/imagem');
      else fail('POST imagem', await img.text());
    } else fail('POST /products', JSON.stringify(prod));
  } catch (e) { fail('Products CRUD', e.message); }
}

if (compradorTok) {
  try {
    const r = await fetch(`${API}/api/orders`, { headers: { Authorization: `Bearer ${compradorTok}` } });
    const lista = await r.json();
    if (r.ok && lista.length) ok('GET /orders');
    else fail('GET /orders', r.status);
  } catch (e) { fail('GET /orders', e.message); }
}

if (auctionId) {
  try {
    const det = await fetch(`${API}/api/auctions/${auctionId}`);
    const bids = await fetch(`${API}/api/auctions/${auctionId}/bids`);
    if (det.ok && bids.ok) ok('GET /auctions/:id e /bids');
    else fail('auction detail', `${det.status}/${bids.status}`);
  } catch (e) { fail('auction detail', e.message); }
}

if (orderIdForReview && compradorTok) {
  try {
    const rev = await fetch(`${API}/api/reviews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${compradorTok}`
      },
      body: JSON.stringify({
        encomenda: orderIdForReview,
        produto: productId,
        classificacao: 5,
        comentario: 'Teste automatizado'
      })
    });
    const revBody = await rev.json().catch(() => null);
    if (rev.status === 201) ok('POST /reviews (após entregue)');
    else fail('POST /reviews', JSON.stringify(revBody));
    const lista = await fetch(`${API}/api/reviews?produtor=${produtorId}`);
    if (lista.ok) ok('GET /reviews');
    if (revBody?._id && adminTok) {
      const den = await fetch(`${API}/api/reviews/${revBody._id}/denuncia`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminTok}` }
      });
      if (den.status === 204) ok('POST /reviews/:id/denuncia');
      else fail('POST denuncia', den.status);
    }
  } catch (e) { fail('Reviews', e.message); }
}

if (compradorTok) {
  try {
    const r = await fetch(`${API}/api/admin/estatisticas`, {
      headers: { Authorization: `Bearer ${compradorTok}` }
    });
    if (r.status === 403) ok('Admin bloqueado para comprador (403)');
    else fail('Admin deve bloquear comprador', r.status);
  } catch (e) { fail('403 admin', e.message); }
}

if (adminTok) {
  try {
    const pend = await fetch(`${API}/api/admin/produtores/pendentes`, {
      headers: { Authorization: `Bearer ${adminTok}` }
    });
    if (pend.ok) ok('GET /admin/produtores/pendentes');
    const den = await fetch(`${API}/api/admin/reviews/denunciadas`, {
      headers: { Authorization: `Bearer ${adminTok}` }
    });
    if (den.ok) ok('GET /admin/reviews/denunciadas');
  } catch (e) { fail('Admin extra', e.message); }
}

if (novoProdutoId && produtorTok) {
  try {
    const del = await fetch(`${API}/api/products/${novoProdutoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${produtorTok}` }
    });
    if (del.status === 204) ok('DELETE /products/:id');
    else fail('DELETE /products', del.status);
  } catch (e) { fail('DELETE product', e.message); }
}

try {
  const r = await fetch(`${API}/api/nao-existe`);
  if (r.status === 404) ok('API 404 em rota inexistente');
  else fail('API 404', r.status);
} catch (e) { fail('API 404', e.message); }

if (adminTok) {
  try {
    const r = await fetch(`${API}/api/admin/estatisticas`, {
      headers: { Authorization: `Bearer ${adminTok}` }
    });
    if (r.ok) ok('GET /admin/estatisticas');
    else fail('/admin/estatisticas', r.status);
  } catch (e) { fail('/admin', e.message); }
}

try {
  const r = await fetch(`${API}/api-docs/`);
  if (r.ok) ok('Swagger UI acessível');
  else fail('Swagger', r.status);
} catch (e) { fail('Swagger', e.message); }

console.log('\n=== REGISTO (API) ===');
const novoEmail = `teste_${Date.now()}@exemplo.pt`;
try {
  const reg = await fetch(`${API}/api/auth/registo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nome: 'Teste Comprador',
      email: novoEmail,
      password: 'teste123',
      papel: 'comprador'
    })
  });
  if (reg.status === 201) ok('POST /auth/registo');
  else fail('registo', await reg.text());
  const log = await auth(novoEmail, 'teste123', API);
  if (log.token) ok('Login pós-registo');
} catch (e) { fail('Registo', e.message); }

console.log('\n=== E2E (Playwright) ===');
const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

try {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/carrinho`);
  await page.waitForURL(/\/login/, { timeout: 10000 });
  ok('SPA: rota /carrinho → login');
} catch (e) { fail('SPA proteção carrinho', e.message); }

const rotas = [
  ['/registo', 'Registar'],
  ['/leiloes', 'Leilões'],
  [`/produtores/${produtorId}`, 'Horta'],
];
for (const [rota, titulo] of rotas) {
  try {
    await page.goto(`${BASE}${rota}`);
    if (rota.startsWith('/produtores/')) {
      await page.waitForSelector('h1', { timeout: 20000 });
    } else {
      await page.getByRole('heading', { name: new RegExp(titulo, 'i') }).first().waitFor({ timeout: 12000 });
    }
    ok(`SPA: rota ${rota}`);
  } catch (e) { fail(`SPA rota ${rota}`, e.message); }
}

try {
  await page.goto(`${BASE}/pagina-invalida-xyz`);
  await page.getByRole('heading', { name: 'Página não encontrada' }).waitFor({ timeout: 8000 });
  ok('SPA: rota * (404)');
} catch (e) { fail('SPA 404', e.message); }

try {
  await page.goto(BASE);
  await page.waitForSelector('.grelha-produtos .cartao-produto', { timeout: 20000 });
  ok('SPA: catálogo carrega produtos');
} catch (e) { fail('SPA catálogo', e.message); }

try {
  await page.goto(`${BASE}/login`);
  await page.fill('#email', 'tasca@exemplo.pt');
  await page.fill('#password', 'password123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  ok('SPA: login comprador');
} catch (e) { fail('SPA login', e.message); }

try {
  await page.goto(BASE);
  const add = page.getByRole('button', { name: 'Adicionar ao carrinho' }).first();
  await add.waitFor({ state: 'visible', timeout: 15000 });
  await add.scrollIntoViewIfNeeded();
  await add.click();
  await page.getByRole('link', { name: /Carrinho \(\d+\)/ }).waitFor({ timeout: 5000 });
  await page.getByRole('link', { name: /Carrinho/ }).click();
  await page.getByRole('button', { name: /Confirmar encomenda/i }).click();
  await page.waitForURL(/\/encomendas/, { timeout: 15000 });
  ok('SPA: carrinho → confirmar encomenda → /encomendas');
} catch (e) { fail('SPA carrinho', e.message); }

try {
  await page.getByRole('link', { name: 'Encomendas' }).click();
  await page.getByRole('heading', { name: 'Encomendas' }).waitFor({ timeout: 10000 });
  ok('SPA: navbar Encomendas');
} catch (e) { fail('SPA encomendas', e.message); }

if (auctionId) {
  try {
    await page.goto(`${BASE}/leiloes/${auctionId}`);
    await page.waitForSelector('.sala-leilao', { timeout: 15000 });
    const min = await page.locator('.valor-atual').textContent();
    ok(`SPA: sala leilão (licitação ${min?.trim()})`);
  } catch (e) { fail('SPA sala leilão', e.message); }
}

try {
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.getByRole('link', { name: 'Entrar' }).waitFor({ timeout: 8000 });
  ok('SPA: botão Sair');
} catch (e) { fail('SPA sair', e.message); }

try {
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`);
  await page.fill('#email', 'admin@exemplo.pt');
  await page.fill('#password', 'password123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  await page.goto(`${BASE}/admin`);
  await page.getByRole('heading', { name: 'Administração' }).waitFor({ timeout: 15000 });
  ok('SPA: painel admin');
} catch (e) { fail('SPA admin', e.message); }

try {
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/login`);
  await page.fill('#email', 'horta@exemplo.pt');
  await page.fill('#password', 'password123');
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 });
  await page.goto(`${BASE}/produtor`);
  await page.getByRole('heading', { name: /Painel do produtor/i }).waitFor({ timeout: 12000 });
  ok('SPA: painel produtor');
  await page.getByRole('link', { name: 'Criar leilão' }).click();
  await page.getByRole('heading', { name: /Criar leilão/i }).waitFor({ timeout: 10000 });
  ok('SPA: botão Criar leilão → formulário');
} catch (e) { fail('SPA produtor', e.message); }

if (compradorTok && auctionId) {
  try {
    const { io } = await import('socket.io-client');
    const licitou = await new Promise((resolve, reject) => {
      const socket = io(API, { auth: { token: compradorTok }, transports: ['websocket'] });
      const t = setTimeout(() => { socket.disconnect(); reject(new Error('timeout licitar')); }, 12000);
      socket.on('connect', () => socket.emit('entrar', auctionId));
      socket.on('nova-licitacao', (msg) => {
        clearTimeout(t);
        socket.disconnect();
        resolve(msg);
      });
      socket.on('connect_error', reject);
      setTimeout(() => socket.emit('licitar', { leilaoId: auctionId, valor: 210 }), 1500);
    });
    if (licitou?.valor >= 205) ok('Socket: licitação aceite');
    else fail('Socket licitar', JSON.stringify(licitou));
  } catch (e) { fail('Socket licitar', e.message); }
}

await browser.close();
terminar();

console.log('\n=== RESUMO ===');
if (falhas.length === 0) {
  console.log(`TUDO OK — 0 falhas (${sucessos} verificações)`);
  process.exit(0);
} else {
  console.log(`${falhas.length} FALHA(S):`);
  falhas.forEach((f) => console.log(' -', f));
  process.exit(1);
}
