import bcrypt from 'bcrypt';
import { getPool } from '../db.js';
import { HttpError } from '../errors.js';
import { presentUser } from '../presenters.js';

const COST = 10;

export async function list() {
  const [rows] = await getPool().query(
    `SELECT id, nom, prenom, email, role, actif, created_at
     FROM users ORDER BY id`,
  );
  return rows.map(presentUser);
}

export async function update(actor, id, body) {
  const [rows] = await getPool().query(
    'SELECT id, nom, prenom, email, role, actif, created_at FROM users WHERE id = ?',
    [id],
  );
  const user = rows[0];
  if (!user) throw new HttpError(404, 'Utilisateur introuvable.');

  const isAdmin = actor.role === 'administrateur';
  const isOwner = actor.id === user.id;
  if (!isAdmin && !isOwner) {
    throw new HttpError(403, 'Vous ne pouvez modifier que votre propre compte.');
  }

  if (!isAdmin && (body.role !== undefined || body.actif !== undefined)) {
    throw new HttpError(403, 'Seul un administrateur peut changer le rôle ou suspendre un compte.');
  }

  if (isAdmin && isOwner && (body.actif === false || (body.role && body.role !== 'administrateur'))) {
    throw new HttpError(409, 'Un administrateur ne peut pas se suspendre ni retirer son propre rôle.');
  }

  const nom = body.nom?.trim() ?? user.nom;
  const prenom = body.prenom?.trim() ?? user.prenom;
  const email = (body.email ?? user.email).toLowerCase();
  const role = body.role ?? user.role;
  const actif = body.actif === undefined ? user.actif : body.actif;
  let passwordHash = null;
  if (body.motDePasse) {
    passwordHash = await bcrypt.hash(body.motDePasse, COST);
  }

  try {
    if (passwordHash) {
      await getPool().query(
        `UPDATE users
         SET nom = ?, prenom = ?, email = ?, role = ?, actif = ?, password_hash = ?
         WHERE id = ?`,
        [nom, prenom, email, role, actif ? 1 : 0, passwordHash, id],
      );
    } else {
      await getPool().query(
        `UPDATE users SET nom = ?, prenom = ?, email = ?, role = ?, actif = ? WHERE id = ?`,
        [nom, prenom, email, role, actif ? 1 : 0, id],
      );
    }
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Un compte existe déjà avec ce courriel.');
    }
    throw error;
  }

  const [updated] = await getPool().query(
    'SELECT id, nom, prenom, email, role, actif, created_at FROM users WHERE id = ?',
    [id],
  );
  return presentUser(updated[0]);
}
