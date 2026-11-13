// Estado global do carrinho (persiste em localStorage entre recarregamentos)
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CHAVE = 'carrinho';

function carregarInicial() {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

const CarrinhoContext = createContext(null);

export function CarrinhoProvider({ children }) {
  const [linhas, setLinhas] = useState(carregarInicial);

  useEffect(() => {
    localStorage.setItem(CHAVE, JSON.stringify(linhas));
  }, [linhas]);

  function adicionar(produto, quantidade = 1) {
    setLinhas((atual) => {
      const existe = atual.find((l) => l.produto._id === produto._id);
      if (existe) {
        return atual.map((l) => l.produto._id === produto._id
          ? { ...l, quantidade: l.quantidade + quantidade } : l);
      }
      return [...atual, { produto, quantidade }];
    });
  }

  function remover(produtoId) {
    setLinhas((atual) => atual.filter((l) => l.produto._id !== produtoId));
  }

  function alterarQuantidade(produtoId, quantidade) {
    const qty = Math.max(1, Number(quantidade) || 1);
    setLinhas((atual) => atual.map((l) => (
      l.produto._id === produtoId ? { ...l, quantidade: qty } : l
    )));
  }

  function esvaziar() {
    setLinhas([]);
    localStorage.removeItem(CHAVE);
  }

  const agruparPorProdutor = useMemo(() => {
    const grupos = {};
    for (const linha of linhas) {
      const id = linha.produto.produtor?._id || linha.produto.produtor;
      if (!grupos[id]) grupos[id] = [];
      grupos[id].push(linha);
    }
    return grupos;
  }, [linhas]);

  const total = useMemo(
    () => linhas.reduce((s, l) => s + l.produto.preco * l.quantidade, 0), [linhas]);

  return (
    <CarrinhoContext.Provider value={{
      linhas, adicionar, remover, alterarQuantidade, esvaziar, agruparPorProdutor, total
    }}>
      {children}
    </CarrinhoContext.Provider>
  );
}

export const useCarrinho = () => useContext(CarrinhoContext);
