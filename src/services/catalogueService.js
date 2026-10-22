import { getPool } from '../db.js';
import { HttpError } from '../errors.js';
import { nomAffiche, presentCategorie, presentOuvrage } from '../presenters.js';

const STAFF = new Set(['editeur', 'gestionnaire', 'administrateur']);

function likePattern(texte) {
  return `%${texte.replace(/[\\%_]/g, '\\$&')}%`;
}

export function isStaff(user) {
  return Boolean(user && STAFF.has(user.role));
}

export async function listCategories() {
  const [rows] = await getPool().query(
    'SELECT id, nom, description FROM categories ORDER BY nom',
  );
  return rows.map(presentCategorie);
}

export async function createCategorie({ nom, description }) {
  try {
    const [result] = await getPool().query(
      'INSERT INTO categories (nom, description) VALUES (?, ?)',
      [nom.trim(), description?.trim() || null],
    );
    const [rows] = await getPool().query(
      'SELECT id, nom, description FROM categories WHERE id = ?',
      [result.insertId],
    );
    return presentCategorie(rows[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Cette catégorie existe déjà.');
    }
    throw error;
  }
}

export async function updateCategorie(id, { nom, description }) {
  const [existing] = await getPool().query('SELECT id FROM categories WHERE id = ?', [id]);
  if (!existing[0]) throw new HttpError(404, 'Catégorie introuvable.');
  try {
    await getPool().query(
      'UPDATE categories SET nom = ?, description = ? WHERE id = ?',
      [nom.trim(), description?.trim() || null, id],
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Cette catégorie existe déjà.');
    }
    throw error;
  }
  const [rows] = await getPool().query(
    'SELECT id, nom, description FROM categories WHERE id = ?',
    [id],
  );
  return presentCategorie(rows[0]);
}

export async function deleteCategorie(id) {
  const [used] = await getPool().query(
    'SELECT id FROM ouvrages WHERE categorie_id = ? LIMIT 1',
    [id],
  );
  if (used[0]) {
    throw new HttpError(409, 'Cette catégorie contient encore des ouvrages.');
  }
  const [result] = await getPool().query('DELETE FROM categories WHERE id = ?', [id]);
  if (result.affectedRows === 0) throw new HttpError(404, 'Catégorie introuvable.');
}

const OUVRAGE_SELECT = `
  SELECT o.id, o.titre, o.auteur, o.isbn, o.description, o.prix, o.stock, o.popularite,
         o.categorie_id, c.nom AS categorie_nom
  FROM ouvrages o
  JOIN categories c ON c.id = o.categorie_id
`;

export async function listOuvrages({ texte, categorie, populariteMin, page, limite, inclureRupture, user }) {
  const where = [];
  const params = [];
  const staff = isStaff(user);
  if (!(inclureRupture && staff)) {
    where.push('o.stock > 0');
  }
  if (texte) {
    const pattern = likePattern(texte);
    where.push(`(o.titre LIKE ? ESCAPE '\\\\' OR o.auteur LIKE ? ESCAPE '\\\\' OR o.isbn LIKE ? ESCAPE '\\\\' OR o.description LIKE ? ESCAPE '\\\\')`);
    params.push(pattern, pattern, pattern, pattern);
  }
  if (categorie) {
    where.push('o.categorie_id = ?');
    params.push(categorie);
  }
  if (populariteMin !== undefined && populariteMin !== null && populariteMin !== '') {
    where.push('o.popularite >= ?');
    params.push(Number(populariteMin));
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [countRows] = await getPool().query(
    `SELECT COUNT(*) AS total FROM ouvrages o ${clause}`,
    params,
  );
  const total = Number(countRows[0].total);
  const offset = (page - 1) * limite;
  const [rows] = await getPool().query(
    `${OUVRAGE_SELECT} ${clause} ORDER BY o.popularite DESC, o.titre ASC LIMIT ? OFFSET ?`,
    [...params, limite, offset],
  );
  return {
    ouvrages: rows.map(presentOuvrage),
    total,
    page,
    limite,
  };
}

export async function getOuvrage(id, user) {
  const [rows] = await getPool().query(`${OUVRAGE_SELECT} WHERE o.id = ?`, [id]);
  const row = rows[0];
  if (!row) throw new HttpError(404, 'Ouvrage introuvable.');
  if (Number(row.stock) <= 0 && !isStaff(user)) {
    throw new HttpError(404, 'Ouvrage introuvable.');
  }
  const [avis] = await getPool().query(
    `SELECT a.note, a.date_avis, u.prenom, u.nom
     FROM avis a JOIN users u ON u.id = a.client_id
     WHERE a.ouvrage_id = ?
     ORDER BY a.date_avis DESC`,
    [id],
  );
  const [commentaires] = await getPool().query(
    `SELECT c.contenu, c.date_soumission, u.prenom, u.nom
     FROM commentaires c JOIN users u ON u.id = c.client_id
     WHERE c.ouvrage_id = ? AND c.statut = 'valide'
     ORDER BY c.date_soumission DESC`,
    [id],
  );
  const noteMoyenne = avis.length
    ? Math.round((avis.reduce((sum, item) => sum + Number(item.note), 0) / avis.length) * 10) / 10
    : null;
  return {
    ouvrage: presentOuvrage(row),
    noteMoyenne,
    nombreAvis: avis.length,
    avis: avis.map((item) => ({
      note: Number(item.note),
      date: item.date_avis,
      auteur: nomAffiche(item.prenom, item.nom),
    })),
    commentaires: commentaires.map((item) => ({
      contenu: item.contenu,
      date: item.date_soumission,
      auteur: nomAffiche(item.prenom, item.nom),
    })),
  };
}

export async function createOuvrage(body) {
  await assertCategorie(body.categorieId);
  try {
    const [result] = await getPool().query(
      `INSERT INTO ouvrages (titre, auteur, isbn, description, prix, stock, popularite, categorie_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        body.titre.trim(),
        body.auteur.trim(),
        body.isbn.trim(),
        body.description?.trim() || null,
        body.prix,
        body.stock,
        body.categorieId,
      ],
    );
    return getOuvrage(result.insertId, { role: 'gestionnaire' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Cet ISBN est déjà au catalogue.');
    throw error;
  }
}

export async function updateOuvrage(id, body) {
  const [existing] = await getPool().query('SELECT id FROM ouvrages WHERE id = ?', [id]);
  if (!existing[0]) throw new HttpError(404, 'Ouvrage introuvable.');
  await assertCategorie(body.categorieId);
  try {
    await getPool().query(
      `UPDATE ouvrages
       SET titre = ?, auteur = ?, isbn = ?, description = ?, prix = ?, stock = ?, categorie_id = ?
       WHERE id = ?`,
      [
        body.titre.trim(),
        body.auteur.trim(),
        body.isbn.trim(),
        body.description?.trim() || null,
        body.prix,
        body.stock,
        body.categorieId,
        id,
      ],
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Cet ISBN est déjà au catalogue.');
    throw error;
  }
  return getOuvrage(id, { role: 'gestionnaire' });
}

export async function deleteOuvrage(id) {
  try {
    const [result] = await getPool().query('DELETE FROM ouvrages WHERE id = ?', [id]);
    if (result.affectedRows === 0) throw new HttpError(404, 'Ouvrage introuvable.');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      throw new HttpError(409, 'Ouvrage déjà lié à une commande, un avis ou une liste. Ajustez le stock plutôt que de le supprimer.');
    }
    throw error;
  }
}

async function assertCategorie(id) {
  const [rows] = await getPool().query('SELECT id FROM categories WHERE id = ?', [id]);
  if (!rows[0]) throw new HttpError(400, 'Catégorie inconnue.');
}
