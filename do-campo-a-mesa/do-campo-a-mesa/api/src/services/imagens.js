// Passo 8: imagens na Cloud (Azure) ou disco local em desenvolvimento
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { BlobServiceClient } = require('@azure/storage-blob');

const TIPOS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

let container;
function obterContainer() {
  if (!container) {
    if (!process.env.STORAGE_CONN) throw new Error('STORAGE_CONN não está definida');
    container = BlobServiceClient
      .fromConnectionString(process.env.STORAGE_CONN)
      .getContainerClient(process.env.STORAGE_CONTAINER || 'produtos');
  }
  return container;
}

/**
 * @param {{ buffer: Buffer, originalname: string, mimetype: string }} ficheiro
 * @returns {Promise<string>} URL público da imagem
 */
async function guardarImagem(ficheiro) {
  if (!ficheiro?.buffer) {
    const err = new Error('Ficheiro em falta');
    err.status = 400;
    throw err;
  }
  const ext = TIPOS[ficheiro.mimetype];
  if (!ext) {
    const err = new Error('Tipo de imagem não suportado (use JPEG, PNG ou WebP)');
    err.status = 400;
    throw err;
  }
  // Nome aleatório: nunca se usa o nome enviado pelo utilizador
  const nome = `${Date.now()}-${crypto.randomUUID()}${ext}`;

  if (process.env.STORAGE_CONN) {
    const blob = obterContainer().getBlockBlobClient(nome);
    await blob.uploadData(ficheiro.buffer, {
      blobHTTPHeaders: { blobContentType: ficheiro.mimetype }
    });
    return blob.url;
  }

  const dir = path.join(__dirname, '..', '..', 'uploads');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, nome), ficheiro.buffer);
  const base = process.env.API_PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/uploads/${nome}`;
}

module.exports = { guardarImagem };
