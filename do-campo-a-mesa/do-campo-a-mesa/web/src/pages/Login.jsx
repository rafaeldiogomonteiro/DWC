import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Página inicial de cada papel depois do login
export const INICIO = { comprador: '/', produtor: '/produtor', admin: '/admin' };

export default function Login() {
  const { entrar } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dados, setDados] = useState({ email: '', password: '' });
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    try {
      const u = await entrar(dados.email, dados.password);
      navigate(location.state?.de || INICIO[u.papel] || '/', { replace: true });
    } catch (err) {
      setErro(err.message);
    }
  }

  return (
    <form className="formulario-estreito" onSubmit={submeter}>
      <h1>Entrar</h1>
      <label htmlFor="email" className="form-label">Email</label>
      <input id="email" type="email" autoComplete="email" className="form-control mb-3" required
        value={dados.email} onChange={(e) => setDados({ ...dados, email: e.target.value })} />
      <label htmlFor="password" className="form-label">Password</label>
      <input id="password" type="password" autoComplete="current-password" className="form-control mb-3" required
        value={dados.password} onChange={(e) => setDados({ ...dados, password: e.target.value })} />
      {erro && <div className="alert alert-danger">{erro}</div>}
      <button type="submit" className="btn btn-success w-100 mb-2">Entrar</button>
      <p className="texto-secundario small mb-0">Ainda não tem conta? <Link to="/registo">Registar</Link></p>
    </form>
  );
}
