// Notificações em tempo real (toasts) para qualquer página: encomendas, leilões e validação de conta
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEventoSocket } from '../context/SocketContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { euro } from '../api/client.js';

export default function Notificacoes() {
  const { atualizar } = useAuth();
  const [lista, setLista] = useState([]);

  const mostrar = useCallback((texto, link) => {
    const id = `${Date.now()}-${Math.random()}`;
    setLista((l) => [...l, { id, texto, link }].slice(-4));
    setTimeout(() => setLista((l) => l.filter((n) => n.id !== id)), 8000);
  }, []);
  const fechar = (id) => setLista((l) => l.filter((n) => n.id !== id));

  useEventoSocket('encomenda-atualizada', useCallback((e) =>
    mostrar(`${e.produtor || 'O produtor'} marcou a sua encomenda como "${e.estado}".`, '/encomendas'), [mostrar]));
  useEventoSocket('nova-encomenda', useCallback((e) =>
    mostrar(`Nova encomenda${e.comprador ? ` de ${e.comprador}` : ''}: ${euro(e.total)}.`, '/produtor'), [mostrar]));
  useEventoSocket('leilao-ganho', useCallback((e) =>
    mostrar(`Ganhou o leilão "${e.lote}" por ${euro(e.valor)}. A encomenda já está criada.`, '/encomendas'), [mostrar]));
  useEventoSocket('leilao-terminado', useCallback((e) =>
    mostrar(e.vencedor ? `O leilão "${e.lote}" terminou: ${e.vencedor.nome} venceu com ${euro(e.valor)}.` : `O leilão "${e.lote}" terminou sem licitações.`, '/produtor'), [mostrar]));
  useEventoSocket('conta-validada', useCallback(() => {
    atualizar();
    mostrar('A sua conta de produtor foi aprovada. Já pode publicar produtos.', '/produtor');
  }, [atualizar, mostrar]));
  useEventoSocket('conta-rejeitada', useCallback(() => {
    atualizar();
    mostrar('O registo da sua conta de produtor foi rejeitado pelo administrador.');
  }, [atualizar, mostrar]));

  return (
    <div className="notificacoes" aria-live="polite" aria-atomic="false">
      {lista.map((n) => (
        <div key={n.id} className="toast show" role="status">
          <div className="toast-body d-flex gap-2 align-items-start">
            <span className="flex-grow-1">
              {n.texto}
              {n.link && <> <Link to={n.link} onClick={() => fechar(n.id)}>Ver</Link></>}
            </span>
            <button type="button" className="btn-close" aria-label="Fechar notificação" onClick={() => fechar(n.id)} />
          </div>
        </div>
      ))}
    </div>
  );
}
