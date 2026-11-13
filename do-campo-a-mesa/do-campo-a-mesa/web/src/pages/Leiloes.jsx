// Lista de leilões ativos e agendados
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useApi } from '../hooks/useApi.js';
import { useContagem, formatarTempo } from '../hooks/useContagem.js';
import { euro } from '../api/client.js';

function CartaoLeilao({ leilao }) {
  const { utilizador } = useAuth();
  const ativo = leilao.estado === 'ativo';
  const restante = useContagem(ativo ? leilao.terminaEm : leilao.iniciaEm);
  return (
    <article className="card h-100 p-3 cartao-leilao">
      <p className="small mb-1">
        {ativo ? <><span className="ponto-direto" aria-hidden="true" /> Em direto</> : <span className="texto-secundario">Agendado</span>}
      </p>
      <h2 className="h5">{leilao.lote}</h2>
      <p className="texto-secundario small mb-1">{leilao.produtor?.produtor?.nomeExploracao || leilao.produtor?.nome} · {leilao.quantidade}</p>
      <p className="mb-1">{ativo ? 'Licitação atual' : 'Preço base'}: <strong>{euro(leilao.licitacaoAtual?.valor ?? leilao.precoBase)}</strong></p>
      <p className="texto-secundario small">{ativo ? 'Termina em' : 'Começa em'} {formatarTempo(restante)}</p>
      {utilizador ? (
        <Link to={`/leiloes/${leilao._id}`} className="btn btn-success mt-auto">
          {utilizador.papel === 'comprador' ? 'Entrar na sala' : 'Acompanhar'}
        </Link>
      ) : (
        <Link to="/login" state={{ de: `/leiloes/${leilao._id}` }} className="btn btn-outline-secondary mt-auto">Entrar para licitar</Link>
      )}
    </article>
  );
}

export default function Leiloes() {
  const ativos = useApi('/auctions?estado=ativo');
  const agendados = useApi('/auctions?estado=agendado');

  return (
    <>
      <h1>Leilões</h1>
      <h2 className="h5 mt-3">Em direto</h2>
      {ativos.erro && <p className="alert alert-danger">{ativos.erro}</p>}
      {ativos.dados?.length ? (
        <div className="grelha-leiloes mb-4">{ativos.dados.map((l) => <CartaoLeilao key={l._id} leilao={l} />)}</div>
      ) : !ativos.aCarregar && <p className="texto-secundario">Não há leilões ativos neste momento.</p>}

      {agendados.dados?.length > 0 && (
        <>
          <h2 className="h5">Próximos leilões</h2>
          <div className="grelha-leiloes">{agendados.dados.map((l) => <CartaoLeilao key={l._id} leilao={l} />)}</div>
        </>
      )}
    </>
  );
}
