import jwt from 'jsonwebtoken';
import { getConfig } from '../config.js';
import { getPool } from '../db.js';
import { HttpError } from '../errors.js';

export function signToken(user) {
  const config = getConfig();
  return jwt.sign({ id: user.id }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

async function loadUser(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, getConfig().jwtSecret);
  } catch {
    throw new HttpError(401, 'Session invalide ou expirée.');
  }
  const [rows] = await getPool().query(
    'SELECT id, nom, prenom, email, role, actif FROM users WHERE id = ?',
    [payload.id],
  );
  const user = rows[0];
  if (!user || !user.actif) {
    throw new HttpError(403, 'Compte suspendu ou introuvable.');
  }
  return {
    id: user.id,
    nom: user.nom,
    prenom: user.prenom,
    email: user.email,
    role: user.role,
  };
}

export function requireAuth(req, res, next) {
  loadUser(req)
    .then((user) => {
      if (!user) {
        next(new HttpError(401, 'Authentification requise.'));
        return;
      }
      req.user = user;
      next();
    })
    .catch(next);
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ') || header.slice(7).trim() === '') {
    next();
    return;
  }
  loadUser(req)
    .then((user) => {
      req.user = user || undefined;
      next();
    })
    .catch(next);
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      next(new HttpError(401, 'Authentification requise.'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new HttpError(403, 'Rôle insuffisant pour cette action.'));
      return;
    }
    next();
  };
}
