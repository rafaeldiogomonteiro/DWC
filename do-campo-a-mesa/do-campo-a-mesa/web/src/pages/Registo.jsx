import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { INICIO } from './Login.jsx';

export default function Registo() {
  const { registar } = useAuth();
  const navigate = useNavigate();
  const [papel, setPapel] = useState('comprador');
  const [dados, setDados] = useState({
    nome: '', email: '', password: '', tipoComprador: 'particular', nomeExploracao: '', localidade: ''
  });
  const [erro, setErro] = useState('');

  async function submeter(e) {
    e.preventDefault();
    setErro('');
    try {
      const corpo = { nome: dados.nome, email: dados.email, password: dados.password, papel };
      if (papel === 'produtor') {
        corpo.produtor = { nomeExploracao: dados.nomeExploracao || dados.nome, localidade: dados.localidade };
      } else {
        corpo.comprador = { tipo: dados.tipoComprador };
      }
      const u = await registar(corpo);
      navigate(INICIO[u.papel] || '/', { replace: true });
    } catch (err) {
      setErro(err.message);
    }
  }

  const mudar = (campo) => (e) => setDados({ ...dados, [campo]: e.target.value });

  return (
    <form className="formulario-estreito" onSubmit={submeter}>
      <h1>Registar</h1>
      <fieldset className="mb-3">
        <legend className="form-label fs-6">Tipo de conta</legend>
        <div className="btn-group w-100" role="group">
          <input type="radio" className="btn-check" name="papel" id="papel-comprador" checked={papel === 'comprador'} onChange={() => setPapel('comprador')} />
          <label className="btn btn-outline-success" htmlFor="papel-comprador">Comprador</label>
          <input type="radio" className="btn-check" name="papel" id="papel-produtor" checked={papel === 'produtor'} onChange={() => setPapel('produtor')} />
          <label className="btn btn-outline-success" htmlFor="papel-produtor">Produtor</label>
        </div>
      </fieldset>
      <label htmlFor="nome" className="form-label">Nome</label>
      <input id="nome" className="form-control mb-3" required autoComplete="name" value={dados.nome} onChange={mudar('nome')} />
      <label htmlFor="email" className="form-label">Email</label>
      <input id="email" type="email" className="form-control mb-3" required autoComplete="email" value={dados.email} onChange={mudar('email')} />
      <label htmlFor="password" className="form-label">Password (mínimo 6 caracteres)</label>
      <input id="password" type="password" className="form-control mb-3" minLength={6} required autoComplete="new-password"
        value={dados.password} onChange={mudar('password')} />
      {papel === 'comprador' ? (
        <>
          <label htmlFor="tipo" className="form-label">Sou</label>
          <select id="tipo" className="form-select mb-3" value={dados.tipoComprador} onChange={mudar('tipoComprador')}>
            <option value="particular">Particular</option>
            <option value="restaurante">Restaurante / restauração</option>
          </select>
        </>
      ) : (
        <>
          <label htmlFor="exploracao" className="form-label">Nome da exploração</label>
          <input id="exploracao" className="form-control mb-3" value={dados.nomeExploracao} onChange={mudar('nomeExploracao')} />
          <label htmlFor="localidade" className="form-label">Localidade</label>
          <input id="localidade" className="form-control mb-3" required value={dados.localidade} onChange={mudar('localidade')} />
          <p className="small texto-secundario">A conta de produtor fica a aguardar validação do administrador antes de poder publicar produtos.</p>
        </>
      )}
      {erro && <div className="alert alert-danger">{erro}</div>}
      <button type="submit" className="btn btn-success w-100 mb-2">Criar conta</button>
      <p className="texto-secundario small mb-0">Já tem conta? <Link to="/login">Entrar</Link></p>
    </form>
  );
}
