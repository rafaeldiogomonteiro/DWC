// Estado global da sessão (utilizador + token), guardado no localStorage
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

function lerSessao() {
  try { return JSON.parse(localStorage.getItem('sessao')) || null; } catch { return null; }
}

export function AuthProvider({ children }) {
  const [sessao, setSessao] = useState(lerSessao);

  const guardarSessao = useCallback((nova) => {
    localStorage.setItem('sessao', JSON.stringify(nova));
    setSessao(nova);
  }, []);

  const sair = useCallback(() => {
    localStorage.removeItem('sessao');
    setSessao(null);
  }, []);

  async function entrar(email, password) {
    const dados = await api('/auth/login', { metodo: 'POST', corpo: { email, password } });
    guardarSessao({ token: dados.token, utilizador: dados.utilizador });
    return dados.utilizador;
  }

  async function registar(corpo) {
    const dados = await api('/auth/registo', { metodo: 'POST', corpo });
    guardarSessao({ token: dados.token, utilizador: dados.utilizador });
    return dados.utilizador;
  }

  // Atualiza os dados do utilizador (ex.: produtor validado) e termina a sessão se o token expirou
  const atualizar = useCallback(async () => {
    const atual = lerSessao();
    if (!atual?.token) return;
    try {
      const utilizador = await api('/auth/eu', { token: atual.token });
      guardarSessao({ ...atual, utilizador });
    } catch (err) {
      if (err.status === 401 || err.status === 404) sair();
    }
  }, [guardarSessao, sair]);

  useEffect(() => { atualizar(); }, [atualizar]);

  return (
    <AuthContext.Provider value={{
      utilizador: sessao?.utilizador || null,
      token: sessao?.token || null,
      entrar, registar, sair, atualizar
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
