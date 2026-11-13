// Comprador: acompanhamento das encomendas (estado em tempo real) e avaliação depois da entrega
import { useCallback, useState } from 'react';
import EstadoEncomenda from '../components/EstadoEncomenda.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useEventoSocket } from '../context/SocketContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { api, euro } from '../api/client.js';

function FormAvaliacao({ encomenda, onFeito }) {
  const { token } = useAuth();
  const [dados, setDados] = useState({ produto: '', classificacao: '5', comentario: '' });
  const [erro, setErro] = useState('');
  const produtos = encomenda.linhas.filter((l) => l.produto);

  async function submeter(e) {
    e.preventDefault();
    try {
      await api('/reviews', {
        metodo: 'POST', token,
        corpo: { encomenda: encomenda._id, produto: dados.produto || undefined, classificacao: Number(dados.classificacao), comentario: dados.comentario }
      });
      onFeito('Avaliação registada. Obrigado!');
    } catch (err) {
      if (err.status === 409) onFeito(err.message);
      else setErro(err.message);
    }
  }

  const id = encomenda._id;
  return (
    <form className="avaliacao-form mt-2" onSubmit={submeter}>
      <div>
        <label className="form-label small mb-1" htmlFor={`av-alvo-${id}`}>Avaliar</label>
        <select id={`av-alvo-${id}`} className="form-select form-select-sm" value={dados.produto} onChange={(e) => setDados({ ...dados, produto: e.target.value })}>
          <option value="">O produtor</option>
          {produtos.map((l) => <option key={l.produto} value={l.produto}>{l.nome}</option>)}
        </select>
      </div>
      <div>
        <label className="form-label small mb-1" htmlFor={`av-nota-${id}`}>Classificação</label>
        <select id={`av-nota-${id}`} className="form-select form-select-sm" value={dados.classificacao} onChange={(e) => setDados({ ...dados, classificacao: e.target.value })}>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}
        </select>
      </div>
      <div className="flex-grow-1">
        <label className="form-label small mb-1" htmlFor={`av-com-${id}`}>Comentário</label>
        <input id={`av-com-${id}`} className="form-control form-control-sm" maxLength={1000} value={dados.comentario} onChange={(e) => setDados({ ...dados, comentario: e.target.value })} />
      </div>
      <button type="submit" className="btn btn-sm btn-success align-self-end">Enviar</button>
      {erro && <p className="text-danger small w-100 mb-0">{erro}</p>}
    </form>
  );
}

export default function Encomendas() {
  const { dados: lista, erro, aCarregar, setDados, recarregar } = useApi('/orders');
  const [aAvaliar, setAAvaliar] = useState(null);
  const [mensagens, setMensagens] = useState({});

  // Atualiza o estado sem recarregar a página quando o produtor o muda
  useEventoSocket('encomenda-atualizada', useCallback((e) => {
    setDados((l) => l?.map((o) => (o._id === e.id ? { ...o, estado: e.estado } : o)));
  }, [setDados]));
  useEventoSocket('leilao-ganho', useCallback(() => { recarregar(); }, [recarregar]));

  return (
    <>
      <h1>Encomendas</h1>
      {erro && <div className="alert alert-danger">{erro}</div>}
      {aCarregar && <p>A carregar…</p>}
      {lista?.length === 0 && <p className="texto-secundario">Ainda não tem encomendas.</p>}
      <div className="lista-encomendas">
        {lista?.map((enc) => (
          <article key={enc._id} className="card p-3">
            <header className="d-flex justify-content-between flex-wrap gap-2 mb-2">
              <strong>#{enc._id.slice(-6).toUpperCase()} · {enc.produtor?.produtor?.nomeExploracao || enc.produtor?.nome || 'Produtor'}</strong>
              <span className="small texto-secundario">
                {new Date(enc.createdAt).toLocaleDateString('pt-PT')}
                {enc.origem === 'leilao' && ' · leilão'}
                {' · '}{enc.entrega?.tipo === 'entrega' ? `entrega em ${enc.entrega.morada}` : 'levantamento'}
              </span>
            </header>
            <EstadoEncomenda estado={enc.estado} />
            <ul className="small texto-secundario my-2">
              {enc.linhas?.map((l, i) => (
                <li key={i}>{l.quantidade} × {l.nome} — {euro(l.precoUnit * l.quantidade)}</li>
              ))}
            </ul>
            <p className="fw-bold mb-0">Total: {euro(enc.total)}</p>
            {mensagens[enc._id] && <p className="alert alert-info py-1 px-2 small mt-2 mb-0">{mensagens[enc._id]}</p>}
            {enc.estado === 'entregue' && !mensagens[enc._id] && (
              aAvaliar === enc._id
                ? <FormAvaliacao encomenda={enc} onFeito={(m) => { setMensagens((x) => ({ ...x, [enc._id]: m })); setAAvaliar(null); }} />
                : <button type="button" className="btn btn-sm btn-outline-success mt-2 align-self-start" onClick={() => setAAvaliar(enc._id)}>Avaliar</button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
