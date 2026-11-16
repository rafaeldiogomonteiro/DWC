// Em desenvolvimento aceita qualquer origem localhost (ex.: 5173 vs 5174)
function origemPermitida() {
  const cliente = process.env.CLIENT_URL;
  if (!cliente) return '*';
  return (origin, callback) => {
    if (!origin || origin === cliente) return callback(null, true);
    const dev = process.env.NODE_ENV !== 'production'
      && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (dev) return callback(null, true);
    return callback(null, false);
  };
}

module.exports = { origemPermitida };
