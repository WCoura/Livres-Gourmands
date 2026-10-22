import crypto from 'node:crypto';
import { getPool, withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import { nomAffiche } from '../presenters.js';

function genererCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

async function charger(conn, id) {
  const db = conn || getPool();
  const [listes] = await db.query(
    `SELECT l.id, l.nom, l.proprietaire_id, l.code_partage, l.created_at,
            u.prenom AS proprietaire_prenom, u.nom AS proprietaire_nom
     FROM listes_cadeaux l
     JOIN users u ON u.id = l.proprietaire_id
     WHERE l.id = ?`,
    [id],
  );
  if (!listes[0]) throw new HttpError(404, 'Liste de cadeaux introuvable.');
  const [items] = await db.query(
    `SELECT li.id, li.ouvrage_id, li.quantite_souhaitee, li.quantite_achetee,
            o.titre, o.auteur, o.prix, o.stock
     FROM liste_items li
     JOIN ouvrages o ON o.id = li.ouvrage_id
     WHERE li.liste_id = ?
     ORDER BY li.id`,
    [id],
  );
  return presentListe(listes[0], items);
}

function presentListe(liste, items) {
  return {
    id: liste.id,
    nom: liste.nom,
    codePartage: liste.code_partage,
    dateCreation: liste.created_at,
    proprietaire: nomAffiche(liste.proprietaire_prenom, liste.proprietaire_nom),
    proprietaireId: liste.proprietaire_id,
    items: items.map((item) => ({
      id: item.id,
      ouvrageId: item.ouvrage_id,
      titre: item.titre,
      auteur: item.auteur,
      prix: item.prix,
      stock: Number(item.stock),
      quantiteSouhaitee: Number(item.quantite_souhaitee),
      quantiteAchetee: Number(item.quantite_achetee),
      reste: Number(item.quantite_souhaitee) - Number(item.quantite_achetee),
    })),
  };
}

export async function creer(clientId, { nom, items }) {
  return withTransaction(async (conn) => {
    const ids = [...new Set(items.map((item) => item.ouvrageId))];
    if (ids.length !== items.length) {
      throw new HttpError(400, 'Chaque ouvrage ne peut apparaître qu\'une fois dans la liste.');
    }
    const [books] = await conn.query(
      'SELECT id, stock FROM ouvrages WHERE id IN (?)',
      [ids],
    );
    if (books.length !== ids.length) throw new HttpError(400, 'Un ouvrage de la liste est introuvable.');
    if (books.some((book) => Number(book.stock) <= 0)) {
      throw new HttpError(409, 'Un ouvrage en rupture ne peut pas être ajouté à une liste.');
    }
    let listeId = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const [result] = await conn.query(
          'INSERT INTO listes_cadeaux (nom, proprietaire_id, code_partage) VALUES (?, ?, ?)',
          [nom.trim(), clientId, genererCode()],
        );
        listeId = result.insertId;
        break;
      } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') throw error;
      }
    }
    if (!listeId) throw new HttpError(500, 'Impossible de générer un code de partage.');
    for (const item of items) {
      await conn.query(
        `INSERT INTO liste_items (liste_id, ouvrage_id, quantite_souhaitee, quantite_achetee)
         VALUES (?, ?, ?, 0)`,
        [listeId, item.ouvrageId, item.quantiteSouhaitee],
      );
    }
    return charger(conn, listeId);
  });
}

export async function mesListes(clientId) {
  const [rows] = await getPool().query(
    'SELECT id FROM listes_cadeaux WHERE proprietaire_id = ? ORDER BY created_at DESC',
    [clientId],
  );
  const listes = [];
  for (const row of rows) listes.push(await charger(null, row.id));
  return listes;
}

export async function parCode(code) {
  const [rows] = await getPool().query(
    'SELECT id FROM listes_cadeaux WHERE code_partage = ?',
    [code],
  );
  if (!rows[0]) throw new HttpError(404, 'Aucune liste ne correspond à ce code.');
  const liste = await charger(null, rows[0].id);
  return {
    ...liste,
    items: liste.items.filter((item) => item.reste > 0 && item.stock > 0),
  };
}

export async function parIdOuCode(idOuCode) {
  if (/^\d+$/.test(String(idOuCode))) {
    const [byId] = await getPool().query(
      'SELECT id FROM listes_cadeaux WHERE id = ?',
      [Number(idOuCode)],
    );
    if (byId[0]) return charger(null, byId[0].id);
  }
  const [byCode] = await getPool().query(
    'SELECT id FROM listes_cadeaux WHERE code_partage = ?',
    [idOuCode],
  );
  if (!byCode[0]) throw new HttpError(404, 'Liste de cadeaux introuvable.');
  return charger(null, byCode[0].id);
}

export async function ajouterItem(clientId, listeId, { ouvrageId, quantiteSouhaitee }) {
  return withTransaction(async (conn) => {
    const liste = await assertProprietaire(conn, clientId, listeId);
    const [books] = await conn.query('SELECT id, stock, titre FROM ouvrages WHERE id = ?', [ouvrageId]);
    if (!books[0] || Number(books[0].stock) <= 0) {
      throw new HttpError(409, 'Ouvrage introuvable ou en rupture.');
    }
    const [existing] = await conn.query(
      'SELECT id, quantite_souhaitee FROM liste_items WHERE liste_id = ? AND ouvrage_id = ?',
      [liste.id, ouvrageId],
    );
    if (existing[0]) {
      await conn.query(
        'UPDATE liste_items SET quantite_souhaitee = quantite_souhaitee + ? WHERE id = ?',
        [quantiteSouhaitee, existing[0].id],
      );
    } else {
      await conn.query(
        `INSERT INTO liste_items (liste_id, ouvrage_id, quantite_souhaitee) VALUES (?, ?, ?)`,
        [liste.id, ouvrageId, quantiteSouhaitee],
      );
    }
    return charger(conn, liste.id);
  });
}

export async function retirerItem(clientId, listeId, itemId) {
  return withTransaction(async (conn) => {
    const liste = await assertProprietaire(conn, clientId, listeId);
    const [result] = await conn.query(
      'DELETE FROM liste_items WHERE id = ? AND liste_id = ? AND quantite_achetee = 0',
      [itemId, liste.id],
    );
    if (result.affectedRows === 0) {
      throw new HttpError(409, 'Article introuvable ou déjà en partie offert.');
    }
    return charger(conn, liste.id);
  });
}

async function assertProprietaire(conn, clientId, listeId) {
  const [rows] = await conn.query(
    'SELECT * FROM listes_cadeaux WHERE id = ? FOR UPDATE',
    [listeId],
  );
  if (!rows[0]) throw new HttpError(404, 'Liste de cadeaux introuvable.');
  if (rows[0].proprietaire_id !== clientId) {
    throw new HttpError(403, 'Cette liste ne vous appartient pas.');
  }
  return rows[0];
}
