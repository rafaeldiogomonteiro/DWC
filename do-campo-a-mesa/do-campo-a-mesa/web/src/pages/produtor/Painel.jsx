// Produtor: painel de gestão (indicadores, catálogo, encomendas, leilões e página pública)
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useEventoSocket } from '../../context/SocketContext.jsx';
import { api, apiUpload, euro } from '../../api/client.js';
import EstadoEncomenda from '../../components/EstadoEncomenda.jsx';

const CATEGORIAS = ['Hortícolas', 'Fruta', 'Mel', 'Vinho', 'Queijo', 'Padaria', 'Outros'];
const EPOCAS = ['Primavera', 'Verão', 'Outono', 'Inverno'];
const PROXIMO = { pendente: ['confirmada', 'Confirmar'], confirmada: ['pronta', 'Marcar pronta'], pronta: ['entregue', 'Marcar entregue'] };

const produtoVazio = { nome: '', descricao: '', categoria: 'Hortícolas', preco: '', unidade: 'kg', stock: '', biologico: false, epocas: [] };
const produtoParaForm = (p) => ({
  nome: p.nome, descricao: p.descricao || '', categoria: p.categoria, preco: String(p.preco), unidade: p.unidade || 'kg',
  stock: String(p.stock ?? ''), biologico: Boolean(p.biologico), epocas: p.epocas || []
});

function Indicador({ titulo, valor, alerta }) {
  return (
    <div className={`card p-3 indicador ${alerta ? 'indicador--alerta' : ''}`}>
      <div className="small texto-secundario">{titulo}</div>
      <div className="indicador__valor">{valor}</div>
    </div>
  );
}

function PaginaPublica({ utilizador, token, onGuardado }) {
  const info = utilizador?.produtor || {};
  const [dados, setDados] = useState({
    nomeExploracao: info.nomeExploracao || '', descricao: info.descricao || '', localidade: info.localidade || '',
    lat: info.localizacao?.lat ?? '', lng: info.localizacao?.lng ?? ''
  });
  const [msg, setMsg] = useState('');
  const mudar = (c) => (e) => setDados({ ...dados, [c]: e.target.value });

  async function guardar(e) {
    e.preventDefault();
    try {
      await api('/producers/eu', {
        metodo: 'PUT', token,
        corpo: {
          nomeExploracao: dados.nomeExploracao, descricao: dados.descricao, localidade: dados.localidade,
          ...(dados.lat !== '' && dados.lng !== '' ? { localizacao: { lat: Number(dados.lat), lng: Number(dados.lng) } } : {})
        }
      });
      setMsg('Página pública atualizada.');
      onGuardado();
    } catch (err) { setMsg(err.message); }
  }

  return (
    <form className="row g-2" onSubmit={guardar}>
      <div className="col-md-6">
        <label className="form-label small mb-1" htmlFor="pp-nome">Nome da exploração</label>
        <input id="pp-nome" className="form-control" value={dados.nomeExploracao} onChange={mudar('nomeExploracao')} />
      </div>
      <div className="col-md-6">
        <label className="form-label small mb-1" htmlFor="pp-loc">Localidade</label>
        <input id="pp-loc" className="form-control" value={dados.localidade} onChange={mudar('localidade')} />
      </div>
      <div className="col-12">
        <label className="form-label small mb-1" htmlFor="pp-desc">Descrição</label>
        <textarea id="pp-desc" className="form-control" rows="2" maxLength={1000} value={dados.descricao} onChange={mudar('descricao')} />
      </div>
      <div className="col-6 col-md-3">
        <label className="form-label small mb-1" htmlFor="pp-lat">Latitude (mapa)</label>
        <input id="pp-lat" type="number" step="any" min="-90" max="90" className="form-control" value={dados.lat} onChange={mudar('lat')} />
      </div>
      <div className="col-6 col-md-3">
        <label className="form-label small mb-1" htmlFor="pp-lng">Longitude (mapa)</label>
        <input id="pp-lng" type="number" step="any" min="-180" max="180" className="form-control" value={dados.lng} onChange={mudar('lng')} />
      </div>
      <div className="col-md-6 d-flex align-items-end gap-2">
        <button type="submit" className="btn btn-success">Guardar página</button>
        {info.validado && <Link to={`/produtores/${utilizador.id}`} className="btn btn-outline-secondary">Ver página pública</Link>}
      </div>
      {msg && <p className="small mb-0">{msg}</p>}
    </form>
  );
}

export default function PainelProdutor() {
  const { token, utilizador, atualizar } = useAuth();
  const [produtos, setProdutos] = useState([]);
  const [encomendas, setEncomendas] = useState([]);
  const [leiloes, setLeiloes] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(produtoVazio);
  const [editId, setEditId] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    if (!utilizador?.id) return;
    api(`/products?produtor=${utilizador.id}`, { token }).then(setProdutos).catch(() => {});
    api('/orders', { token }).then(setEncomendas).catch(() => {});
    api(`/auctions?produtor=${utilizador.id}`, { token }).then(setLeiloes).catch(() => {});
    api('/producers/eu/estatisticas', { token }).then(setStats).catch(() => {});
  }, [token, utilizador?.id]);

  useEffect(() => { carregar(); }, [carregar]);
  // Nova encomenda ou leilão terminado: atualiza o painel em tempo real
  useEventoSocket('nova-encomenda', carregar);
  useEventoSocket('leilao-terminado', carregar);

  function cancelarEdicao() { setEditId(null); setForm(produtoVazio); setErro(''); }
  function iniciarEdicao(p) { setEditId(p._id); setForm(produtoParaForm(p)); setErro(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  const alternarEpoca = (e) => setForm((f) => ({ ...f, epocas: f.epocas.includes(e) ? f.epocas.filter((x) => x !== e) : [...f.epocas, e] }));

  async function guardarProduto(e) {
    e.preventDefault();
    setErro('');
    const corpo = { ...form, preco: Number(form.preco), stock: Number(form.stock) || 0 };
    try {
      if (editId) await api(`/products/${editId}`, { metodo: 'PUT', token, corpo });
      else await api('/products', { metodo: 'POST', token, corpo });
      cancelarEdicao();
      carregar();
    } catch (err) { setErro(err.message); }
  }

  async function acao(fn) {
    setErro('');
    try { await fn(); carregar(); } catch (err) { setErro(err.message); }
  }

  const removerProduto = (id) => window.confirm('Remover este produto?') && acao(async () => {
    await api(`/products/${id}`, { metodo: 'DELETE', token });
    if (editId === id) cancelarEdicao();
  });
  const enviarImagem = (id, ficheiro) => ficheiro && acao(() => apiUpload(`/products/${id}/imagem`, ficheiro, { token }));
  const mudarEstado = (id, estado) => acao(() => api(`/orders/${id}/estado`, { metodo: 'PATCH', token, corpo: { estado } }));

  const validado = utilizador?.produtor?.validado;
  const abertas = encomendas.filter((o) => o.estado !== 'entregue');
  const leiloesAtivos = leiloes.filter((l) => l.estado !== 'terminado');

  return (
    <>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h1 className="mb-0">Painel do produtor</h1>
        {validado && <Link to="/produtor/leiloes/novo" className="btn btn-success">Criar leilão</Link>}
      </div>

      {!validado && (
        <p className="alert alert-warning">
          A sua conta ainda aguarda validação pelo administrador. Até lá não pode publicar produtos nem criar leilões.
          {' '}<button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={atualizar}>Verificar novamente</button>
        </p>
      )}

      {stats && (
        <section className="grelha-indicadores mb-3" aria-label="Indicadores">
          <Indicador titulo="Vendas (total)" valor={euro(stats.vendasTotal)} />
          <Indicador titulo="Vendas (30 dias)" valor={euro(stats.vendasUltimos30Dias)} />
          <Indicador titulo="Encomendas por tratar" valor={stats.encomendasPorEstado.pendente + stats.encomendasPorEstado.confirmada + stats.encomendasPorEstado.pronta} />
          <Indicador titulo="Avaliação média" valor={stats.numAvaliacoes ? `${stats.avaliacaoMedia} ★ (${stats.numAvaliacoes})` : '—'} />
          <Indicador titulo="Produtos com stock baixo" valor={stats.stockBaixo.length} alerta={stats.stockBaixo.length > 0} />
          <Indicador titulo="Leilões ativos" valor={stats.leiloesAtivos} />
        </section>
      )}

      {stats?.stockBaixo.length > 0 && (
        <div className="alert alert-warning" role="alert">
          <strong>Stock baixo:</strong> {stats.stockBaixo.map((p) => `${p.nome} (${p.stock} ${p.unidade})`).join(', ')}
        </div>
      )}

      {stats?.maisVendidos.length > 0 && (
        <details className="mb-4">
          <summary>Produtos mais vendidos</summary>
          <table className="table table-sm mt-2">
            <thead><tr><th>Produto</th><th className="text-end">Quantidade</th><th className="text-end">Receita</th></tr></thead>
            <tbody>
              {stats.maisVendidos.map((m) => (
                <tr key={m.nome}><td>{m.nome}</td><td className="text-end">{m.quantidade}</td><td className="text-end">{euro(m.receita)}</td></tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {erro && <p className="alert alert-danger">{erro}</p>}

      <div className="paineis">
        <section aria-labelledby="t-encomendas">
          <h2 id="t-encomendas" className="h5">Encomendas em curso ({abertas.length})</h2>
          {abertas.length === 0 && <p className="texto-secundario">Sem encomendas por tratar.</p>}
          {abertas.map((enc) => (
            <article key={enc._id} className="card p-3 mb-2">
              <p className="mb-1 d-flex justify-content-between flex-wrap gap-1">
                <strong>#{enc._id.slice(-6).toUpperCase()} · {enc.comprador?.nome}</strong>
                <span className="small texto-secundario">{enc.entrega?.tipo === 'entrega' ? `Entrega: ${enc.entrega.morada}` : 'Levantamento'}{enc.origem === 'leilao' && ' · leilão'}</span>
              </p>
              <ul className="small texto-secundario mb-2">
                {enc.linhas.map((l, i) => <li key={i}>{l.quantidade} × {l.nome}</li>)}
              </ul>
              <EstadoEncomenda estado={enc.estado} />
              <div className="d-flex justify-content-between align-items-center mt-2">
                <strong>{euro(enc.total)}</strong>
                {PROXIMO[enc.estado] && (
                  <button type="button" className="btn btn-sm btn-success" onClick={() => mudarEstado(enc._id, PROXIMO[enc.estado][0])}>
                    {PROXIMO[enc.estado][1]}
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>

        <section aria-labelledby="t-leiloes">
          <h2 id="t-leiloes" className="h5">Os meus leilões</h2>
          {leiloes.length === 0 && <p className="texto-secundario">Ainda não criou leilões.</p>}
          <ul className="list-group mb-3">
            {[...leiloesAtivos, ...leiloes.filter((l) => l.estado === 'terminado').slice(0, 5)].map((l) => (
              <li key={l._id} className="list-group-item d-flex justify-content-between align-items-center gap-2 flex-wrap">
                <span>
                  {l.estado === 'ativo' && <span className="ponto-direto" aria-hidden="true" />}
                  {l.lote} <span className="small texto-secundario">· {l.estado} · {euro(l.licitacaoAtual?.valor)}{l.licitacaoAtual?.nome && ` (${l.licitacaoAtual.nome})`}</span>
                </span>
                <Link to={`/leiloes/${l._id}`} className="btn btn-sm btn-outline-secondary">{l.estado === 'terminado' ? 'Ver' : 'Acompanhar'}</Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-4" aria-labelledby="t-produto">
        <h2 id="t-produto" className="h5">{editId ? 'Editar produto' : 'Novo produto'}</h2>
        <form className="row g-2 mb-2" onSubmit={guardarProduto}>
          <div className="col-md-4">
            <label className="form-label small mb-1" htmlFor="p-nome">Nome</label>
            <input id="p-nome" className="form-control" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1" htmlFor="p-cat">Categoria</label>
            <select id="p-cat" className="form-select" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1" htmlFor="p-preco">Preço (€)</label>
            <input id="p-preco" type="number" step="0.01" min="0" className="form-control" required value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1" htmlFor="p-un">Unidade</label>
            <input id="p-un" className="form-control" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label small mb-1" htmlFor="p-stock">Stock</label>
            <input id="p-stock" type="number" min="0" className="form-control" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          </div>
          <div className="col-12">
            <label className="form-label small mb-1" htmlFor="p-desc">Descrição / ingredientes</label>
            <input id="p-desc" className="form-control" maxLength={1000} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <fieldset className="col-md-8 d-flex flex-wrap gap-3 align-items-center">
            <legend className="form-label small mb-0 me-2 w-auto float-none">Épocas</legend>
            {EPOCAS.map((e) => (
              <div key={e} className="form-check">
                <input className="form-check-input" type="checkbox" id={`ep-${e}`} checked={form.epocas.includes(e)} onChange={() => alternarEpoca(e)} />
                <label className="form-check-label small" htmlFor={`ep-${e}`}>{e}</label>
              </div>
            ))}
            <div className="form-check">
              <input className="form-check-input" type="checkbox" id="bio-painel" checked={form.biologico} onChange={(e) => setForm({ ...form, biologico: e.target.checked })} />
              <label className="form-check-label small" htmlFor="bio-painel">Biológico</label>
            </div>
          </fieldset>
          <div className="col-md-4 d-flex gap-2 justify-content-md-end">
            {editId && <button type="button" className="btn btn-outline-secondary" onClick={cancelarEdicao}>Cancelar</button>}
            <button type="submit" className="btn btn-success" disabled={!validado}>{editId ? 'Guardar alterações' : 'Adicionar produto'}</button>
          </div>
        </form>
      </section>

      <section className="mt-3" aria-labelledby="t-catalogo">
        <h2 id="t-catalogo" className="h5">Catálogo ({produtos.length})</h2>
        <ul className="list-group mb-4">
          {produtos.map((p) => (
            <li key={p._id} className="list-group-item">
              <div className="d-flex flex-wrap gap-3 align-items-center justify-content-between">
                <div className="d-flex gap-3 align-items-center">
                  {p.imagemUrl
                    ? <img src={p.imagemUrl} alt="" width="56" height="56" className="rounded object-fit-cover" />
                    : <div className="miniatura-vazia" aria-hidden="true" />}
                  <span>
                    <strong>{p.nome}</strong> — {euro(p.preco)} / {p.unidade}
                    <span className={`ms-2 small ${p.stock < 10 ? 'text-danger fw-bold' : 'texto-secundario'}`}>stock: {p.stock}</span>
                    {p.biologico && <span className="badge bg-success ms-1">BIO</span>}
                  </span>
                </div>
                <div className="d-flex flex-wrap gap-2 align-items-center">
                  <label className="btn btn-sm btn-outline-secondary mb-0">
                    Fotografia
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="d-none"
                      onChange={(e) => { enviarImagem(p._id, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                  <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => iniciarEdicao(p)}>Editar</button>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removerProduto(p._id)}>Remover</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-3" aria-labelledby="t-pagina">
        <h2 id="t-pagina" className="h5">Página pública</h2>
        <PaginaPublica key={utilizador?.id} utilizador={utilizador} token={token} onGuardado={atualizar} />
      </section>
    </>
  );
}
