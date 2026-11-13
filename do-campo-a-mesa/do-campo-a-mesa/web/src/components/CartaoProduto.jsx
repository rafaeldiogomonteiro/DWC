// Componente reutilizável: cartão de produto (catálogo e página do produtor)
import { Link } from 'react-router-dom';
import { euro } from '../api/client.js';

// "Hortícolas" -> "horticolas" (classe com a cor da categoria, gerada em SASS com @each)
const classeCategoria = (c) => `cat-${(c || 'Outros').normalize('NFD').replace(/[\u0300-\u036f\s]/g, '').toLowerCase()}`;

export default function CartaoProduto({ produto, onAdicionar }) {
  const produtor = produto.produtor;
  const esgotado = produto.stock === 0;
  return (
    <article className="card cartao-produto h-100">
      {produto.imagemUrl ? (
        <img src={produto.imagemUrl} className="cartao-produto__foto" alt={produto.nome} loading="lazy" />
      ) : (
        <div className={`cartao-produto__imagem ${classeCategoria(produto.categoria)}`} aria-hidden="true">
          <span>{produto.nome.charAt(0)}</span>
        </div>
      )}
      <div className="card-body d-flex flex-column">
        <div className="d-flex gap-1 mb-2">
          {produto.biologico && <span className="etiqueta">BIO</span>}
          {esgotado && <span className="etiqueta etiqueta--esgotado">ESGOTADO</span>}
        </div>
        <h3 className="h6 mb-1">{produto.nome}</h3>
        {produtor?._id ? (
          <Link to={`/produtores/${produtor._id}`} className="small texto-secundario mb-2">
            {produtor.produtor?.nomeExploracao || produtor.nome}
            {produtor.produtor?.localidade && ` · ${produtor.produtor.localidade}`}
          </Link>
        ) : produtor?.nome && (
          <p className="small texto-secundario mb-2">{produtor.nome} · {produtor.produtor?.localidade}</p>
        )}
        {produto.avaliacaoMedia > 0 && (
          <p className="small mb-1" aria-label={`Avaliação ${produto.avaliacaoMedia} em 5`}>
            <span className="text-warning">★</span> {produto.avaliacaoMedia.toFixed(1)}
          </p>
        )}
        <p className="preco mt-auto mb-2">{euro(produto.preco)} <span className="texto-secundario small">/ {produto.unidade}</span></p>
        {onAdicionar && (
          <button type="button" className="btn btn-success w-100" onClick={onAdicionar} disabled={esgotado}>
            Adicionar ao carrinho
          </button>
        )}
      </div>
    </article>
  );
}
