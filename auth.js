const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'mercam_secret_2024';
const JWT_EXPIRES = '12h';

// Gera hash da senha
async function hashSenha(senha) {
  return bcrypt.hash(senha, 10);
}

// Verifica senha
async function verificarSenha(senha, hash) {
  return bcrypt.compare(senha, hash);
}

// Gera token JWT
function gerarToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

// Verifica token JWT
function verificarToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// Middleware para proteger rotas do colaborador
function authColaborador(req, res, next) {
  const token = req.headers['x-auth-token'] || req.cookies?.authToken;
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  const payload = verificarToken(token);
  if (!payload || payload.role !== 'colaborador') {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
  req.colaborador = payload;
  next();
}

// Middleware para proteger rotas do admin
function authAdmin(req, res, next) {
  const token = req.headers['x-auth-token'];
  if (!token) return res.status(401).json({ error: 'Não autenticado.' });
  const payload = verificarToken(token);
  if (!payload || payload.role !== 'admin') {
    return res.status(401).json({ error: 'Token inválido ou expirado.' });
  }
  next();
}

module.exports = { hashSenha, verificarSenha, gerarToken, verificarToken, authColaborador, authAdmin };