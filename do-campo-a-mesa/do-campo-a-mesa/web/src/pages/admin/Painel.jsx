// Administrador: validação de produtores, moderação e painel global
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useEventoSocket } from '../../context/SocketContext.jsx';
import { api, euro } from '../../api/client.js';

const ROTULOS = {
  utilizadores: 'Utilizadores',
  produtores: 'Produtores ativos',
  produtoresPendentes: 'Produtores por validar',
  encomendasHoje: 'Encomendas hoje',
  encomendasAbertas: 'Encomendas em curso',
  leiloesAtivos: 'Leilões ativos',
  avaliacoesDenunciadas: 'Avaliações denunciadas'
};
const SERVICOS = { api: 'API REST', socketio: 'Socket.io', mongodb: 'MongoDB', storage: 'Storage de imagens', swagger: 'Swagger UI' };

export default function PainelAdmin() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [servicos, setServicos] = useState(null);
  const [pendentes, setPendentes] = useState([]);
  const [denunciadas, setDenunciadas] = useState([]);
  const [leiloes, setLeiloes] = useState([]);
  const [utilizadores, setUtilizadores] = useState([]);
  const [encomendas, setEncomendas] = useState([]);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    const pedir = (caminho, set) => api(caminho, { token }).then(set).catch((e) => setErro(e.message));
    pedir('/admin/estatisticas', setStats);
    pedir('/admin/servicos', setServicos);
    pedir('/admin/produtores/pendentes', setPendentes);
    pedir('/admin/reviews/denunciadas', setDenunciadas);
    pedir('/auctions?estado=ativo', setLeiloes);
    pedir('/admin/utilizadores', setUtilizadores);
    pedir('/orders', setEncomendas);
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  // Leilões ativos em tempo real (sala "admins")
  useEventoSocket('leilao-atualizado', useCallback((e) => {
    if (e.licitacaoAtual) {
      setLeiloes((ls) => ls.map((l) => (l._id === e.id ? { ...l, licitacaoAtual: e.licitacaoAtual, numLicitacoes: e.numLicitacoes } : l)));
    } else {
      api('/auctions?estado=ativo').then(setLeiloes).catch(() => {});
      api('/admin/estatisticas', { token }).then(setStats).catch(() => {});
    }
  }, [token]));

  async function acao(caminho, corpo) {
    setErro('');
    try {
      await api(caminho, { metodo: 'PATCH', token, corpo });
      carregar();
    } catch (e) { setErro(e.message); }
  }

  return (
    <>
      <h1>Administração</h1>
      {erro && <p className="alert alert-danger">{erro}</p>}

      {stats && (
        <section className="grelha-indicadores mb-4" aria-label="Indicadores globais">
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className={`card p-3 indicador ${k === 'produtoresPendentes' && v ? 'indicador--alerta' : ''}`}>
              <div className="small texto-secundario">{ROTULOS[k] || k}</div>
              <div className="indicador__valor">{v}</div>
            </div>
          ))}
        </section>
      )}

      <div className="paineis">
        <section aria-labelledby="t-pendentes">
          <h2 id="t-pendentes" className="h5">Produtores por validar</h2>
          {pendentes.length === 0 ? <p className="texto-secundario">Nenhum pendente.</p> : (
            <ul className="list-group mb-4">
              {pendentes.map((p) => (
                <li key={p._id} className="list-group-item d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <span>
                    <strong>{p.produtor?.nomeExploracao || p.nome}</strong>
                    <span className="small texto-secundario d-block">{p.email} · {p.produtor?.localidade || 'sem localidade'} · {new Date(p.createdAt).toLocaleDateString('pt-PT')}</span>
                  </span>
                  <span className="d-flex gap-2">
                    <button type="button" className="btn btn-sm btn-success" onClick={() => acao(`/admin/produtores/${p._id}/validacao`, { aprovado: true })}>Aprovar</button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => acao(`/admin/produtores/${p._id}/validacao`, { aprovado: false })}>Rejeitar</button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h2 className="h5">Avaliações denunciadas</h2>
          {denunciadas.length === 0 ? <p className="texto-secundario">Nenhuma denúncia.</p> : (
            <ul className="list-group mb-4">
              {denunciadas.map((r) => (
                <li key={r._id} className={`list-group-item ${r.visivel ? '' : 'opacity-75'}`}>
                  <p className="mb-1">"{r.comentario || '(sem comentário)'}"</p>
                  <p className="small texto-secundario mb-2">
                    {r.autor?.nome} sobre {r.produto?.nome || r.produtor?.nome} · {r.classificacao} ★ · {r.denuncias} denúncia(s) · {r.visivel ? 'visível' : 'oculta'}
                  </p>
                  {r.visivel
                    ? <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => acao(`/admin/reviews/${r._id}`, { visivel: false })}>Ocultar</button>
                    : <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => acao(`/admin/reviews/${r._id}`, { visivel: true })}>Repor</button>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="t-leiloes">
          <h2 id="t-leiloes" className="h5"><span className="ponto-direto" aria-hidden="true" /> Leilões ativos</h2>
          {leiloes.length === 0 ? <p className="texto-secundario">Nenhum leilão ativo.</p> : (
            <ul className="list-group mb-4" aria-live="polite">
              {leiloes.map((l) => (
                <li key={l._id} className="list-group-item d-flex justify-content-between align-items-center gap-2 flex-wrap">
                  <span>
                    {l.lote}
                    <span className="small texto-secundario d-block">
                      {l.produtor?.nome} · {euro(l.licitacaoAtual?.valor)} · {l.numLicitacoes || 0} licitações · termina às {new Date(l.terminaEm).toLocaleTimeString('pt-PT')}
                    </span>
                  </span>
                  <Link to={`/leiloes/${l._id}`} className="btn btn-sm btn-outline-secondary">Acompanhar</Link>
                </li>
              ))}
            </ul>
          )}

          <h2 className="h5">Estado dos serviços</h2>
          {servicos && (
            <ul className="list-group mb-4">
              {Object.entries(servicos).map(([k, s]) => (
                <li key={k} className="list-group-item d-flex justify-content-between">
                  <span>{SERVICOS[k] || k}{s.tipo && <span className="small texto-secundario"> · {s.tipo}</span>}{s.ligacoes != null && <span className="small texto-secundario"> · {s.ligacoes} ligações</span>}</span>
                  <span className={`badge ${s.estado === 'ok' ? 'bg-success' : 'bg-danger'}`}>{s.estado}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-2" aria-labelledby="t-encomendas">
        <h2 id="t-encomendas" className="h5">Encomendas recentes</h2>
        <div className="table-responsive mb-4">
          <table className="table table-sm align-middle">
            <thead><tr><th>#</th><th>Comprador</th><th>Produtor</th><th>Estado</th><th className="text-end">Total</th></tr></thead>
            <tbody>
              {encomendas.slice(0, 15).map((o) => (
                <tr key={o._id}>
                  <td>{o._id.slice(-6).toUpperCase()}</td>
                  <td>{o.comprador?.nome}</td>
                  <td>{o.produtor?.produtor?.nomeExploracao || o.produtor?.nome}</td>
                  <td className="text-capitalize">{o.estado}</td>
                  <td className="text-end">{euro(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="t-utilizadores">
        <h2 id="t-utilizadores" className="h5">Utilizadores ({utilizadores.length})</h2>
        <div className="table-responsive">
          <table className="table table-sm align-middle">
            <thead><tr><th>Nome</th><th>Email</th><th>Papel</th><th>Registo</th></tr></thead>
            <tbody>
              {utilizadores.map((u) => (
                <tr key={u._id}>
                  <td>{u.nome}</td>
                  <td>{u.email}</td>
                  <td>{u.papel}{u.papel === 'produtor' && !u.produtor?.validado && <span className="badge bg-warning text-dark ms-1">por validar</span>}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString('pt-PT')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
