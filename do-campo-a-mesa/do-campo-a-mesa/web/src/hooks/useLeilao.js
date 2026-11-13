// Passo 7: ligação em tempo real a uma sala de leilão. O socket é desligado ao sair da página.
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL } from '../api/client.js';

export function useLeilao(id, token) {
  const socketRef = useRef(null);
  const [leilao, setLeilao] = useState(null);
  const [licitacoes, setLicitacoes] = useState([]);
  const [participantes, setParticipantes] = useState(0);
  const [offset, setOffset] = useState(0);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState('');
  const [ligado, setLigado] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(API_URL, { auth: { token } });
    socketRef.current = socket;

    const entrar = () => socket.emit('entrar', id);
    const onEstado = ({ agora, leilao: l, licitacoes: ls }) => {
      setOffset(new Date(agora).getTime() - Date.now());
      setLeilao(l);
      setLicitacoes(ls);
      if (l.estado === 'terminado') {
        setResultado({ vencedor: l.licitacaoAtual?.comprador ? { id: l.licitacaoAtual.comprador, nome: l.licitacaoAtual.nome } : null, valor: l.licitacaoAtual?.valor });
      }
    };
    const onNova = (b) => {
      setLeilao((l) => l && ({ ...l, licitacaoAtual: { valor: b.valor, comprador: b.comprador, nome: b.nome, em: b.createdAt }, numLicitacoes: b.numLicitacoes }));
      setLicitacoes((ls) => [b, ...ls].slice(0, 20));
      setErro('');
    };
    const onTerminado = (r) => {
      setResultado(r);
      setLeilao((l) => l && ({ ...l, estado: 'terminado' }));
    };

    socket.on('connect', () => { setLigado(true); entrar(); }); // volta a entrar na sala se a ligação cair
    socket.on('disconnect', () => setLigado(false));
    socket.on('connect_error', (e) => setErro(`Sem ligação ao servidor: ${e.message}`));
    socket.on('estado', onEstado);
    socket.on('nova-licitacao', onNova);
    socket.on('presenca', setParticipantes);
    socket.on('recusada', setErro);
    socket.on('aberto', entrar);
    socket.on('terminado', onTerminado);

    return () => {
      socket.emit('sair', id);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [id, token]);

  const licitar = (valor) => new Promise((resolve) => {
    setErro('');
    if (!socketRef.current) return resolve({ ok: false });
    socketRef.current.emit('licitar', { leilaoId: id, valor }, resolve);
  });

  return { leilao, licitacoes, participantes, offset, resultado, erro, ligado, licitar };
}
