// Cria um erro com código HTTP, tratado pelo errorHandler
module.exports = (status, mensagem) => Object.assign(new Error(mensagem), { status });
