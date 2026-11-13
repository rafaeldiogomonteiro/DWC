// Sala de leilão em tempo real: qualquer utilizador autenticado assiste, só compradores licitam
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLeilao } from '../hooks/useLeilao.js';
import { useContagem, formatarTempo } from '../hooks/useContagem.js';
import { euro } from '../api/client.js';

const ATALHOS = [5, 10, 25];
const cent = (v) => Math.round(v * 100) / 100;

export default function SalaLeilao() {
  const { id } = useParams();
  const { token, utilizador } = useAuth();
  const { leilao, licitacoes, participantes, offset, resultado, erro, ligado, licitar } = useLeilao(id, token);
  const ativo = leilao?.estado === 'ativo' && !resultado;
  const restante = useContagem(leilao?.estado === 'agendado' ? leilao?.iniciaEm : leilao?.terminaEm, offset);
  const [valor, setValor] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const [aceite, setAceite] = useState('');

  const atual = leilao?.licitacaoAtual?.valor ?? leilao?.precoBase ?? 0;
  const minimo = cent(atual + (leilao?.incremento ?? 0));
  const souComprador = utilizador?.papel === 'comprador';
  const vouAGanhar = leilao?.licitacaoAtual?.comprador && leilao.licitacaoAtual.comprador === utilizador?.id;

  // Sugere sempre o valor mínimo quando a licitação atual muda
  useEffect(() => { if (minimo) setValor(minimo.toFixed(2)); }, [minimo]);

  async function submeter(e) {
    e.preventDefault();
    setAEnviar(true);
    setAceite('');
    const r = await licitar(Number(valor));
    if (r?.ok) setAceite(`Licitação de ${euro(r.valor)} aceite.`);
    setAEnviar(false);
  }

  if (!leilao) {
    return erro ? <p className="alert alert-danger">{erro}</p> : <p>A ligar à sala do leilão…</p>;
  }

  return (
    <div className="sala-leilao">
      <section>
        <p className="small mb-1">
          {ativo ? <><span className="ponto-direto" aria-hidden="true" /> Em direto</> : <span className="texto-secundario text-capitalize">{resultado ? 'terminado' : leilao.estado}</span>}
          {' · '}<Link to="/leiloes">Todos os leilões</Link>
        </p>
        <h1>{leilao.lote}</h1>
        <p className="texto-secundario">
          {leilao.produtor?.produtor?.nomeExploracao || leilao.produtor?.nome}
          {leilao.produtor?.produtor?.localidade && ` · ${leilao.produtor.produtor.localidade}`}
          {leilao.quantidade && ` · ${leilao.quantidade}`}
        </p>
        {leilao.produto?.imagemUrl && <img src={leilao.produto.imagemUrl} alt={leilao.produto.nome} className="sala-leilao__foto mb-3" />}
        {leilao.descricao && <p>{leilao.descricao}</p>}
        <p className="small texto-secundario">Preço base {euro(leilao.precoBase)} · incremento mínimo {euro(leilao.incremento)}</p>

        <h2 className="h6 mt-4">Histórico de licitações ({leilao.numLicitacoes ?? licitacoes.length})</h2>
        <ol className="list-group list-group-flush historico-licitacoes" aria-live="polite">
          {licitacoes.map((lic, i) => (
            <li key={lic._id || i} className={`list-group-item px-0 small d-flex justify-content-between ${i === 0 ? 'fw-bold' : ''}`}>
              <span>{lic.nome || 'Comprador'}{lic.comprador === utilizador?.id && ' (eu)'}</span>
              <span>{euro(lic.valor)} <span className="texto-secundario fw-normal">· {new Date(lic.createdAt).toLocaleTimeString('pt-PT')}</span></span>
            </li>
          ))}
          {licitacoes.length === 0 && <li className="list-group-item px-0 texto-secundario small">Ainda sem licitações.</li>}
        </ol>
      </section>

      <aside className="card p-3 painel-leilao" aria-label="Painel do leilão">
        <div className="d-flex justify-content-between small texto-secundario mb-2">
          <span>{participantes} a assistir</span>
          <span className={ligado ? 'text-success' : 'text-danger'}>{ligado ? 'Ligado' : 'Sem ligação'}</span>
        </div>
        <p className="texto-secundario small mb-0">{leilao.estado === 'agendado' ? 'Começa em' : 'Tempo restante'}</p>
        <p className={`contagem ${ativo && restante < 60000 ? 'contagem--final' : ''}`} aria-live="off">
          {resultado ? 'Terminado' : formatarTempo(restante)}
        </p>
        <p className="texto-secundario small mb-0">Licitação atual</p>
        <p className="valor-atual mb-1">{euro(atual)}</p>
        <p className="small mb-3">{leilao.licitacaoAtual?.nome ? `por ${leilao.licitacaoAtual.nome}` : 'Sem licitações (preço base)'}</p>
        {vouAGanhar && ativo && <p className="alert alert-success py-2">É a licitação mais alta.</p>}

        {resultado && (
          <div className="alert alert-secondary">
            {resultado.vencedor
              ? <>Leilão terminado. Vencedor: <strong>{resultado.vencedor.nome}</strong> com {euro(resultado.valor)}.</>
              : 'Leilão terminado sem licitações.'}
            {resultado.vencedor?.id === utilizador?.id && <> <Link to="/encomendas">Ver a encomenda</Link></>}
          </div>
        )}

        {ativo && souComprador && (
          <form className="d-grid gap-2" onSubmit={submeter}>
            <div className="d-flex gap-2" role="group" aria-label="Atalhos de licitação">
              {ATALHOS.map((k) => (
                <button key={k} type="button" className="btn btn-outline-secondary flex-fill"
                  onClick={() => setValor(cent(Math.max(atual + k, minimo)).toFixed(2))}>+{k} €</button>
              ))}
            </div>
            <label htmlFor="valor" className="form-label small mb-0">O seu valor (mínimo {euro(minimo)})</label>
            <input id="valor" type="number" step="0.01" min={minimo} className="form-control form-control-lg"
              value={valor} onChange={(e) => setValor(e.target.value)} required />
            <button type="submit" className="btn btn-success btn-lg" disabled={aEnviar || !ligado}>
              Licitar {euro(Number(valor) || minimo)}
            </button>
          </form>
        )}
        {ativo && !souComprador && <p className="small texto-secundario mb-0">Está a assistir. Só compradores podem licitar.</p>}
        {aceite && <div className="alert alert-success mt-2 mb-0 py-2" role="status">{aceite}</div>}
        {erro && <div className="alert alert-warning mt-2 mb-0 py-2" role="alert">{erro}</div>}
      </aside>
    </div>
  );
}
