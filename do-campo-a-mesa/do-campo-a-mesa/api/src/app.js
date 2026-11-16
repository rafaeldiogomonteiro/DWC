// Configuração da aplicação Express (sem arrancar o servidor, para facilitar testes)
const path = require('path');
const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const errorHandler = require('./middleware/errorHandler');
const { origemPermitida } = require('./config/cors');

const app = express();

// Na Cloud a API corre atrás de um proxy que termina o TLS
app.set('trust proxy', 1);
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => (req.secure ? next() : res.redirect(301, `https://${req.headers.host}${req.originalUrl}`)));
}

app.use(cors({ origin: origemPermitida() }));
app.use(express.json({ limit: '1mb' }));
// Imagens guardadas localmente quando não há storage na Cloud configurado (desenvolvimento)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Passo 5: documentação OpenAPI em /api-docs
const openapi = YAML.load(path.join(__dirname, '..', 'openapi.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapi));

app.get('/api/health', (req, res) => res.json({ estado: 'ok' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/producers', require('./routes/producers'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/auctions', require('./routes/auctions'));
app.use('/api/reviews', require('./routes/reviews'));
app.use('/api/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).json({ erro: 'Recurso não encontrado' }));
app.use(errorHandler);

module.exports = app;
