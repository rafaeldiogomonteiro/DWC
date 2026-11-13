// Produtor: criação de leilão com preço base, incremento e duração
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';

export default function NovoLeilao() {
  const { token, utilizador } = useAuth();
  const navigate = useNavigate();
  const [produtos, setProdutos] = useState([]);
  const [dados, setDados] = useState({
    lote: '', descricao: '', quantidade: '', produto: '', precoBase: '', incremento: '5', duracaoMinutos: '30', iniciaEm: ''
  });
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (utilizador?.id) api(`/products?produtor=${utilizador.id}`, { token }).then(setProdutos).catch(() => {});
  }, [token, utilizador?.id]);

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    try {
      const leilao = await api('/auctions', {
        metodo: 'POST', token,
        corpo: {
          lote: dados.lote,
          descricao: dados.descricao || undefined,
          quantidade: dados.quantidade,
          produto: dados.produto || undefined,
          precoBase: Number(dados.precoBase),
          incremento: Number(dados.incremento),
          duracaoMinutos: Number(dados.duracaoMinutos),
          iniciaEm: dados.iniciaEm ? new Date(dados.iniciaEm).toISOString() : undefined
        }
      });
      navigate(`/leiloes/${leilao._id}`);
    } catch (err) {
      setErro(err.message);
    }
  }

  const mudar = (c) => (e) => setDados({ ...dados, [c]: e.target.value });

  return (
    <form className="formulario-estreito" onSubmit={submeter}>
      <h1>Criar leilão</h1>
      <label className="form-label" htmlFor="l-produto">Produto (opcional)</label>
      <select id="l-produto" className="form-select mb-3" value={dados.produto} onChange={mudar('produto')}>
        <option value="">—</option>
        {produtos.map((p) => <option key={p._id} value={p._id}>{p.nome}</option>)}
      </select>
      <label className="form-label" htmlFor="l-lote">Descrição do lote</label>
      <input id="l-lote" className="form-control mb-3" required maxLength={150} placeholder="200 kg de kiwi Hayward, calibre A" value={dados.lote} onChange={mudar('lote')} />
      <label className="form-label" htmlFor="l-qt">Quantidade</label>
      <input id="l-qt" className="form-control mb-3" placeholder="200 kg" value={dados.quantidade} onChange={mudar('quantidade')} />
      <label className="form-label" htmlFor="l-desc">Detalhes (opcional)</label>
      <textarea id="l-desc" className="form-control mb-3" rows="2" maxLength={1000} value={dados.descricao} onChange={mudar('descricao')} />
      <div className="row g-2">
        <div className="col-6">
          <label className="form-label" htmlFor="l-base">Preço base (€)</label>
          <input id="l-base" type="number" step="0.01" min="0" className="form-control mb-3" required value={dados.precoBase} onChange={mudar('precoBase')} />
        </div>
        <div className="col-6">
          <label className="form-label" htmlFor="l-inc">Incremento mínimo (€)</label>
          <input id="l-inc" type="number" step="0.01" min="0.01" className="form-control mb-3" required value={dados.incremento} onChange={mudar('incremento')} />
        </div>
        <div className="col-6">
          <label className="form-label" htmlFor="l-dur">Duração (minutos)</label>
          <input id="l-dur" type="number" min="1" className="form-control mb-3" required value={dados.duracaoMinutos} onChange={mudar('duracaoMinutos')} />
        </div>
        <div className="col-6">
          <label className="form-label" htmlFor="l-ini">Início (vazio = agora)</label>
          <input id="l-ini" type="datetime-local" className="form-control mb-3" value={dados.iniciaEm} onChange={mudar('iniciaEm')} />
        </div>
      </div>
      {erro && <div className="alert alert-danger">{erro}</div>}
      <button type="submit" className="btn btn-success w-100">Publicar leilão</button>
    </form>
  );
}
