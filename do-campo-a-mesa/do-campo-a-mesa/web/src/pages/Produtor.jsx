// Visitante: página pública do produtor (dados, mapa, avaliações e produtos)
import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import CartaoProduto from '../components/CartaoProduto.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCarrinho } from '../context/CarrinhoContext.jsx';
import { api } from '../api/client.js';

// Mapa OpenStreetMap embebido (não precisa de chave de API)
function Mapa({ lat, lng, titulo }) {
  const d = 0.02;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join(',');
  return (
    <div className="mapa">
      <iframe title={`Mapa: ${titulo}`} loading="lazy"
        src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`} />
      <a className="small" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`} target="_blank" rel="noreferrer">
        Abrir mapa completo no OpenStreetMap
      </a>
    </div>
  );
}

export default function Produtor() {
  const { id } = useParams();
  const { token, utilizador } = useAuth();
  const carrinho = useCarrinho();
  const [dados, setDados] = useState(null);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [erro, setErro] = useState('');
  const [msgAvaliacao, setMsgAvaliacao] = useState('');

  const carregarAvaliacoes = useCallback(() => {
    api(`/reviews?produtor=${id}`).then(setAvaliacoes).catch(() => setAvaliacoes([]));
  }, [id]);

  useEffect(() => {
    setErro('');
    api(`/producers/${id}`).then(setDados).catch((e) => setErro(e.message));
    carregarAvaliacoes();
  }, [id, carregarAvaliacoes]);

  async function denunciar(reviewId) {
    if (!token) { setMsgAvaliacao('Inicie sessão para denunciar uma avaliação.'); return; }
    if (!window.confirm('Denunciar esta avaliação?')) return;
    try {
      await api(`/reviews/${reviewId}/denuncia`, { metodo: 'POST', token });
      setMsgAvaliacao('Denúncia registada. O administrador irá analisar.');
    } catch (e) {
      setMsgAvaliacao(e.message);
    }
  }

  if (erro) return <p className="alert alert-danger">{erro}</p>;
  if (!dados) return <p>A carregar…</p>;

  const { produtor, produtos, avaliacaoMedia, numAvaliacoes } = dados;
  const info = produtor.produtor || {};
  const { lat, lng } = info.localizacao || {};

  return (
    <article className="pagina-produtor">
      <header className="pagina-produtor__cabecalho">
        <div>
          <h1>{info.nomeExploracao || produtor.nome}</h1>
          <p className="texto-secundario mb-1">{info.localidade}</p>
          <p className="mb-2">
            <span className="text-warning" aria-hidden="true">★</span>{' '}
            <strong>{avaliacaoMedia || '—'}</strong> / 5 <span className="texto-secundario small">({numAvaliacoes || 0} avaliações)</span>
          </p>
          {info.descricao && <p>{info.descricao}</p>}
        </div>
        {lat != null && lng != null && <Mapa lat={lat} lng={lng} titulo={info.nomeExploracao || produtor.nome} />}
      </header>

      <h2 className="h5 mt-4">Produtos</h2>
      <section className="grelha-produtos" aria-label="Produtos do produtor">
        {produtos.map((p) => (
          <CartaoProduto key={p._id} produto={{ ...p, produtor: { nome: produtor.nome, produtor: info } }}
            onAdicionar={utilizador?.papel === 'comprador' ? () => carrinho.adicionar({ ...p, produtor: { _id: produtor._id, nome: produtor.nome, produtor: info } }) : undefined} />
        ))}
      </section>
      {produtos.length === 0 && <p className="texto-secundario">Sem produtos publicados.</p>}

      <h2 className="h5 mt-4">Avaliações dos clientes</h2>
      {msgAvaliacao && <p className="alert alert-info py-2">{msgAvaliacao}</p>}
      {avaliacoes.length === 0 ? (
        <p className="texto-secundario">Ainda não há avaliações públicas.</p>
      ) : (
        <ul className="list-group mb-4">
          {avaliacoes.map((r) => (
            <li key={r._id} className="list-group-item">
              <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div>
                  <strong>{r.autor?.nome || 'Cliente'}</strong>
                  <span className="ms-2 text-warning" aria-label={`Classificação ${r.classificacao} em 5`}>
                    {'★'.repeat(r.classificacao)}{'☆'.repeat(5 - r.classificacao)}
                  </span>
                  {r.produto?.nome && <span className="small texto-secundario ms-2">sobre {r.produto.nome}</span>}
                  {r.comentario && <p className="mb-0 mt-1 small">{r.comentario}</p>}
                </div>
                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => denunciar(r._id)}>Denunciar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link to="/" className="btn btn-outline-secondary mt-3">Voltar ao catálogo</Link>
    </article>
  );
}
