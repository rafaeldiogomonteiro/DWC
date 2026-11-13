// Cliente HTTP da API: junta o URL base e o token JWT a cada pedido
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
export const USAR_DADOS_SIMULADOS = import.meta.env.VITE_USAR_DADOS_SIMULADOS === 'true';

export class ErroApi extends Error {
  constructor(mensagem, status, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

async function tratar(resposta) {
  if (resposta.status === 204) return null;
  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const detalhes = dados?.detalhes ? ` (${Object.values(dados.detalhes).join('; ')})` : '';
    throw new ErroApi(`${dados?.erro || `Erro ${resposta.status}`}${detalhes}`, resposta.status, dados?.detalhes);
  }
  return dados;
}

export async function api(caminho, { metodo = 'GET', corpo, token } = {}) {
  const resposta = await fetch(`${API_URL}/api${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  return tratar(resposta);
}

// Envio de ficheiros (multipart/form-data): o browser define o Content-Type
export async function apiUpload(caminho, ficheiro, { token, campo = 'imagem' } = {}) {
  const corpo = new FormData();
  corpo.append(campo, ficheiro);
  const resposta = await fetch(`${API_URL}/api${caminho}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: corpo
  });
  return tratar(resposta);
}

export const euro = (v) => Number(v || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
