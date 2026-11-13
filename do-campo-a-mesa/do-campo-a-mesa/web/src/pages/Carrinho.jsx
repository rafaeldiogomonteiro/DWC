// Comprador: carrinho e checkout (a API cria uma encomenda por produtor)
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCarrinho } from '../context/CarrinhoContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api, euro } from '../api/client.js';

export default function Carrinho() {
  const { linhas, remover, alterarQuantidade, agruparPorProdutor, esvaziar, total } = useCarrinho();
  const { token, utilizador } = useAuth();
  const navigate = useNavigate();
  const [entrega, setEntrega] = useState({ tipo: 'levantamento', morada: utilizador?.comprador?.morada || '' });
  const [erro, setErro] = useState('');
  const [aEnviar, setAEnviar] = useState(false);

  async function finalizar(e) {
    e.preventDefault();
    setErro('');
    setAEnviar(true);
    try {
      await api('/orders', {
        metodo: 'POST',
        token,
        corpo: {
          linhas: linhas.map((l) => ({ produto: l.produto._id, quantidade: l.quantidade })),
          entrega: entrega.tipo === 'entrega' ? entrega : { tipo: 'levantamento' }
        }
      });
      esvaziar();
      navigate('/encomendas');
    } catch (err) {
      setErro(err.message);
    } finally {
      setAEnviar(false);
    }
  }

  const numProdutores = Object.keys(agruparPorProdutor).length;

  return (
    <>
      <h1>Carrinho</h1>
      {linhas.length === 0 ? <p>O carrinho está vazio. <Link to="/">Ver o catálogo</Link></p> : (
        <div className="carrinho">
          <ul className="list-group">
            {linhas.map(({ produto, quantidade }) => (
              <li key={produto._id} className="list-group-item carrinho__linha">
                <div>
                  <strong>{produto.nome}</strong>
                  <div className="small texto-secundario">{produto.produtor?.produtor?.nomeExploracao || produto.produtor?.nome} · {euro(produto.preco)} / {produto.unidade}</div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <label className="visually-hidden" htmlFor={`qt-${produto._id}`}>Quantidade de {produto.nome}</label>
                  <input id={`qt-${produto._id}`} type="number" min="1" max={produto.stock || undefined} className="form-control form-control-sm carrinho__qt"
                    value={quantidade} onChange={(e) => alterarQuantidade(produto._id, e.target.value)} />
                  <span className="carrinho__subtotal">{euro(produto.preco * quantidade)}</span>
                  <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remover(produto._id)}
                    aria-label={`Remover ${produto.nome}`}>Remover</button>
                </div>
              </li>
            ))}
          </ul>

          <form onSubmit={finalizar} className="card p-3 carrinho__resumo">
            <p className="h5">Total: {euro(total)}</p>
            <p className="texto-secundario small">
              {numProdutores > 1 ? `Serão criadas ${numProdutores} encomendas, uma por produtor.` : 'Será criada 1 encomenda.'}
            </p>
            <fieldset className="mb-2">
              <legend className="form-label fs-6">Entrega</legend>
              <div className="form-check">
                <input className="form-check-input" type="radio" name="entrega" id="ent-lev" checked={entrega.tipo === 'levantamento'}
                  onChange={() => setEntrega({ ...entrega, tipo: 'levantamento' })} />
                <label className="form-check-label" htmlFor="ent-lev">Levantamento no produtor</label>
              </div>
              <div className="form-check">
                <input className="form-check-input" type="radio" name="entrega" id="ent-ent" checked={entrega.tipo === 'entrega'}
                  onChange={() => setEntrega({ ...entrega, tipo: 'entrega' })} />
                <label className="form-check-label" htmlFor="ent-ent">Entrega ao domicílio</label>
              </div>
            </fieldset>
            {entrega.tipo === 'entrega' && (
              <>
                <label className="form-label small" htmlFor="morada">Morada</label>
                <input id="morada" className="form-control mb-2" required
                  value={entrega.morada} onChange={(e) => setEntrega({ ...entrega, morada: e.target.value })} />
              </>
            )}
            {erro && <div className="alert alert-danger">{erro}</div>}
            <button type="submit" className="btn btn-success w-100" disabled={aEnviar}>
              {aEnviar ? 'A enviar…' : 'Confirmar encomenda'}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
