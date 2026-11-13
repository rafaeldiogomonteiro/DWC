// API com MongoDB em memória (replica set de 1 nó), com dados de demonstração
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const { spawn } = require('child_process');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const apiRoot = path.join(__dirname, '..');

(async () => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await replSet.waitUntilRunning();
  const uri = replSet.getUri('do-campo-a-mesa');
  const env = { ...process.env, MONGODB_URI: uri };
  console.log('MongoDB em memória (replSet):', uri);
  process.env.MONGODB_URI = uri;
  await require('../src/seed/seed')();
  const server = spawn('node', ['src/server.js'], { cwd: apiRoot, env, stdio: 'inherit' });
  const fechar = async () => {
    server.kill();
    await replSet.stop();
    process.exit(0);
  };
  process.on('SIGINT', fechar);
  process.on('SIGTERM', fechar);
  server.on('exit', (code) => {
    replSet.stop().then(() => process.exit(code ?? 0));
  });
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
