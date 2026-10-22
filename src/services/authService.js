import bcrypt from 'bcrypt';
import { getPool } from '../db.js';
import { HttpError } from '../errors.js';
import { presentUser } from '../presenters.js';
import { signToken } from '../middleware/auth.js';

const COST = 10;

export async function register({ nom, prenom, email, motDePasse }) {
  const passwordHash = await bcrypt.hash(motDePasse, COST);
  try {
    const [result] = await getPool().query(
      `INSERT INTO users (nom, prenom, email, password_hash, role, actif)
       VALUES (?, ?, ?, ?, 'client', 1)`,
      [nom.trim(), prenom.trim(), email.toLowerCase(), passwordHash],
    );
    const user = await findById(result.insertId);
    return { utilisateur: presentUser(user), token: signToken(user) };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Un compte existe déjà avec ce courriel.');
    }
    throw error;
  }
}

export async function login({ email, motDePasse }) {
  const [rows] = await getPool().query(
    'SELECT * FROM users WHERE email = ?',
    [email.toLowerCase()],
  );
  const user = rows[0];
  if (!user) {
    throw new HttpError(401, 'Courriel ou mot de passe incorrect.');
  }
  const ok = await bcrypt.compare(motDePasse, user.password_hash);
  if (!ok) {
    throw new HttpError(401, 'Courriel ou mot de passe incorrect.');
  }
  if (!user.actif) {
    throw new HttpError(403, 'Ce compte est suspendu.');
  }
  return { utilisateur: presentUser(user), token: signToken(user) };
}

export async function findById(id) {
  const [rows] = await getPool().query(
    'SELECT id, nom, prenom, email, role, actif, created_at FROM users WHERE id = ?',
    [id],
  );
  return rows[0] || null;
}

export async function me(id) {
  const user = await findById(id);
  if (!user) throw new HttpError(404, 'Utilisateur introuvable.');
  return presentUser(user);
}
