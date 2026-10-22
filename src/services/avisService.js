import { getPool } from '../db.js';
import { HttpError } from '../errors.js';
import { nomAffiche } from '../presenters.js';

export async function ajouterAvis(clientId, ouvrageId, note) {
  const [books] = await getPool().query('SELECT id, titre FROM ouvrages WHERE id = ?', [ouvrageId]);
  if (!books[0]) throw new HttpError(404, 'Ouvrage introuvable.');
  const [achats] = await getPool().query(
    `SELECT cmd.id
     FROM commandes cmd
     JOIN commande_items ci ON ci.commande_id = cmd.id
     WHERE cmd.client_id = ?
       AND ci.ouvrage_id = ?
       AND cmd.statut IN ('payee', 'en_preparation', 'expediee', 'livree')
     LIMIT 1`,
    [clientId, ouvrageId],
  );
  if (!achats[0]) {
    throw new HttpError(403, 'Un avis n\'est possible qu\'après l\'achat de cet ouvrage.');
  }
  try {
    await getPool().query(
      'INSERT INTO avis (client_id, ouvrage_id, note, date_avis) VALUES (?, ?, ?, CURRENT_DATE)',
      [clientId, ouvrageId, note],
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'Vous avez déjà laissé un avis sur cet ouvrage.');
    }
    throw error;
  }
  return { ouvrageId, note };
}

export async function ajouterCommentaire(clientId, ouvrageId, contenu) {
  const [books] = await getPool().query('SELECT id FROM ouvrages WHERE id = ?', [ouvrageId]);
  if (!books[0]) throw new HttpError(404, 'Ouvrage introuvable.');
  const [result] = await getPool().query(
    `INSERT INTO commentaires (client_id, ouvrage_id, contenu, statut)
     VALUES (?, ?, ?, 'en_attente')`,
    [clientId, ouvrageId, contenu.trim()],
  );
  return {
    id: result.insertId,
    ouvrageId,
    contenu: contenu.trim(),
    statut: 'en_attente',
  };
}

export async function listerCommentaires(statut) {
  const params = [];
  let where = '';
  if (statut) {
    where = 'WHERE c.statut = ?';
    params.push(statut);
  }
  const [rows] = await getPool().query(
    `SELECT c.id, c.contenu, c.statut, c.date_soumission, c.date_validation,
            c.ouvrage_id, o.titre, u.prenom, u.nom
     FROM commentaires c
     JOIN ouvrages o ON o.id = c.ouvrage_id
     JOIN users u ON u.id = c.client_id
     ${where}
     ORDER BY c.date_soumission ASC`,
    params,
  );
  return rows.map((row) => ({
    id: row.id,
    contenu: row.contenu,
    statut: row.statut,
    dateSoumission: row.date_soumission,
    dateValidation: row.date_validation,
    ouvrageId: row.ouvrage_id,
    titre: row.titre,
    auteur: nomAffiche(row.prenom, row.nom),
  }));
}

export async function deciderCommentaire(editeurId, id, decision) {
  const [rows] = await getPool().query('SELECT * FROM commentaires WHERE id = ?', [id]);
  if (!rows[0]) throw new HttpError(404, 'Commentaire introuvable.');
  if (rows[0].statut !== 'en_attente') {
    throw new HttpError(409, 'Ce commentaire a déjà été traité.');
  }
  const statut = decision === 'valider' ? 'valide' : 'rejete';
  await getPool().query(
    `UPDATE commentaires
     SET statut = ?, date_validation = NOW(), valide_par = ?
     WHERE id = ?`,
    [statut, editeurId, id],
  );
  return { id: Number(id), statut };
}
