import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 24 || secret.includes('replace-with')) {
  console.warn('WARNING: Set a unique JWT_SECRET (24+ characters) in server/.env before production use.');
}
export const hashPassword = (password) => bcrypt.hash(password, 12);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
export function signToken(user) {
  return jwt.sign({ sub: user.id, type: user.account_type, role: user.role }, secret || 'development-only-secret-change-me', { expiresIn: '8h', issuer: 'smartflow' });
}
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  try {
    const decoded = jwt.verify(token, secret || 'development-only-secret-change-me', { issuer: 'smartflow' });
    req.user = { id: Number(decoded.sub), type: decoded.type, role: decoded.role };
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in again.' });
  }
}
export function allowTypes(...types) {
  return (req, res, next) => {
    if (!req.user || !types.includes(req.user.type)) return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    next();
  };
}
export function allowRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'This action is not permitted for your employee role.' });
    next();
  };
}
