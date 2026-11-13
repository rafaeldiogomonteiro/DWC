// Visitante: catálogo com pesquisa e filtros por categoria, produtor, localidade, época e modo de produção
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CartaoProduto from '../components/CartaoProduto.jsx';
import { useCarrinho } from '../context/CarrinhoContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useContagem, formatarTempo } from '../hooks/useContagem.js';
import { api, euro, USAR_DADOS_SIMULADOS } from '../api/client.js';
import produtosSimulados from '../data/produtos.json';

const CATEGORIAS = ['Todos', 'Hortícolas', 'Fruta', 'Mel', 'Vinho', 'Queijo', 'Padaria', 'Outros'];
const EPOCAS = ['Primavera', 'Verão', 'Outono', 'Inverno'];
const FILTRO_INICIAL = { q: '', categoria: 'Todos', bio: false, epoca: '', precoMax: '', produtor: '', localidade: '', ordenacao: 'nome' };

function LeilaoDestaque({ leilao }) {
  const { utilizador } = useAuth();
  const restante = useContagem(leilao.terminaEm);
  return (
    <div className="card p-3 mt-3 leilao-destaque">
      <p className="small mb-1"><span className="ponto-direto" aria-hidden="true" /> Leilão em direto</p>
      <h2 className="h5">{leilao.lote}</h2>
      <p className="mb-2">
        Licitação atual: <strong>{euro(leilao.licitacaoAtual?.valor)}</strong> · termina em {formatarTempo(restante)}
      </p>
      <Link to={utilizador ? `/leiloes/${leilao._id}` : '/login'} state={utilizador ? undefined : { de: `/leiloes/${leilao._id}` }}
        className="btn btn-success btn-sm align-self-start">
        {utilizador?.papel === 'comprador' ? 'Entrar e licitar' : utilizador ? 'Assistir' : 'Entrar para licitar'}
      </Link>
    </div>
  );
}

export default function Catalogo() {
  const [produtos, setProdutos] = useState([]);
  const [produtores, setProdutores] = useState([]);
  const [leilaoDestaque, setLeilaoDestaque] = useState(null);
  const [filtro, setFiltro] = useState(FILTRO_INICIAL);
  const [erro, setErro] = useState('');
  const carrinho = useCarrinho();
  const { utilizador } = useAuth();

  useEffect(() => {
    if (USAR_DADOS_SIMULADOS) return;
    api('/auctions?estado=ativo').then((lista) => setLeilaoDestaque(lista[0] || null)).catch(() => {});
    api('/producers').then(setProdutores).catch(() => {});
  }, []);

  useEffect(() => {
    if (USAR_DADOS_SIMULADOS) {
      let lista = produtosSimulados.filter((p) =>
        (filtro.categoria === 'Todos' || p.categoria === filtro.categoria) &&
        (!filtro.bio || p.biologico) &&
        (!filtro.epoca || p.epocas?.includes(filtro.epoca)) &&
        (!filtro.localidade || p.produtor?.produtor?.localidade === filtro.localidade) &&
        p.nome.toLowerCase().includes(filtro.q.toLowerCase()));
      if (filtro.precoMax) lista = lista.filter((p) => p.preco <= Number(filtro.precoMax));
      if (filtro.ordenacao === 'preco_asc') lista = [...lista].sort((a, b) => a.preco - b.preco);
      if (filtro.ordenacao === 'preco_desc') lista = [...lista].sort((a, b) => b.preco - a.preco);
      setProdutos(lista);
      return undefined;
    }
    // Espera 300 ms depois da última tecla antes de pedir à API
    const t = setTimeout(() => {
      const q = new URLSearchParams(Object.entries(filtro).filter(([k, v]) => v !== '' && v !== false && !(k === 'categoria' && v === 'Todos')));
      api(`/products?${q}`).then((d) => { setProdutos(d); setErro(''); }).catch((e) => setErro(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [filtro]);

  const mudar = (campo) => (e) =>
    setFiltro((f) => ({ ...f, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const localidades = [...new Set((USAR_DADOS_SIMULADOS ? produtosSimulados.map((p) => p.produtor) : produtores)
    .map((p) => p?.produtor?.localidade).filter(Boolean))].sort();

  return (
    <>
      <section className="destaque mb-4">
        <h1>Direto de quem produz, para a sua mesa.</h1>
        <p className="texto-secundario">Produtores do Alto Minho. Encomende ou dispute os lotes da época nos leilões em direto.</p>
        {leilaoDestaque && <LeilaoDestaque leilao={leilaoDestaque} />}
      </section>

      <section className="filtros mb-3" aria-label="Pesquisa e filtros">
        <div>
          <label className="form-label small mb-1" htmlFor="pesquisa">Pesquisar</label>
          <input id="pesquisa" type="search" className="form-control" placeholder="Produto, ingrediente ou produtor…"
            value={filtro.q} onChange={mudar('q')} />
        </div>
        <div className="d-flex flex-wrap gap-2" role="group" aria-label="Categoria">
          {CATEGORIAS.map((c) => (
            <button key={c} type="button" aria-pressed={filtro.categoria === c}
              className={`btn btn-sm ${filtro.categoria === c ? 'btn-dark' : 'btn-outline-secondary'}`}
              onClick={() => setFiltro((f) => ({ ...f, categoria: c }))}>{c}</button>
          ))}
        </div>
        <div className="filtros__grelha">
          <div>
            <label className="form-label small mb-1" htmlFor="f-produtor">Produtor</label>
            <select id="f-produtor" className="form-select" value={filtro.produtor} onChange={mudar('produtor')} disabled={USAR_DADOS_SIMULADOS}>
              <option value="">Todos</option>
              {produtores.map((p) => <option key={p._id} value={p._id}>{p.produtor?.nomeExploracao || p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label small mb-1" htmlFor="f-localidade">Localidade</label>
            <select id="f-localidade" className="form-select" value={filtro.localidade} onChange={mudar('localidade')}>
              <option value="">Todas</option>
              {localidades.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label small mb-1" htmlFor="f-epoca">Época</label>
            <select id="f-epoca" className="form-select" value={filtro.epoca} onChange={mudar('epoca')}>
              <option value="">Qualquer época</option>
              {EPOCAS.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label small mb-1" htmlFor="f-preco">Preço máximo (€)</label>
            <input id="f-preco" type="number" min="0" step="0.1" className="form-control" value={filtro.precoMax} onChange={mudar('precoMax')} />
          </div>
          <div>
            <label className="form-label small mb-1" htmlFor="f-ordem">Ordenar por</label>
            <select id="f-ordem" className="form-select" value={filtro.ordenacao} onChange={mudar('ordenacao')}>
              <option value="nome">Nome</option>
              <option value="preco_asc">Preço ↑</option>
              <option value="preco_desc">Preço ↓</option>
              <option value="recentes">Mais recentes</option>
            </select>
          </div>
          <div className="form-check align-self-end mb-2">
            <input id="bio" className="form-check-input" type="checkbox" checked={filtro.bio} onChange={mudar('bio')} />
            <label className="form-check-label" htmlFor="bio">Só modo biológico</label>
          </div>
        </div>
      </section>

      {erro && <div className="alert alert-danger">{erro}</div>}

      <section className="grelha-produtos" aria-label="Produtos">
        {produtos.map((p) => (
          <CartaoProduto key={p._id} produto={p}
            onAdicionar={utilizador?.papel === 'comprador' ? () => carrinho.adicionar(p) : undefined} />
        ))}
      </section>
      {produtos.length === 0 && <p className="texto-secundario">Nenhum produto encontrado.</p>}
      {!utilizador && produtos.length > 0 && (
        <p className="texto-secundario small mt-3"><Link to="/registo">Registe-se</Link> como comprador para passar a encomendar.</p>
      )}
    </>
  );
}
