import { getConfig } from '../config.js';
import { withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import { fromCents, toCents } from '../money.js';

async function lockClient(conn, clientId) {
  const [rows] = await conn.query('SELECT id, role, actif FROM users WHERE id = ? FOR UPDATE', [clientId]);
  if (!rows[0] || !rows[0].actif) throw new HttpError(403, 'Compte suspendu ou introuvable.');
  if (rows[0].role !== 'client') {
    throw new HttpError(403, 'Le panier est réservé aux comptes clients.');
  }
}

async function panierActif(conn, clientId) {
  const heures = getConfig().panierExpirationHeures;
  const [rows] = await conn.query(
    `SELECT id, client_id, actif, created_at, updated_at,
            TIMESTAMPDIFF(HOUR, updated_at, NOW()) AS age_heures
     FROM paniers
     WHERE client_id = ? AND actif = 1
     ORDER BY id DESC
     LIMIT 1
     FOR UPDATE`,
    [clientId],
  );
  const panier = rows[0];
  if (panier && Number(panier.age_heures) >= heures) {
    await conn.query('DELETE FROM panier_items WHERE panier_id = ?', [panier.id]);
    await conn.query('UPDATE paniers SET actif = 0, updated_at = updated_at WHERE id = ?', [panier.id]);
  } else if (panier) {
    return panier;
  }
  const [created] = await conn.query('INSERT INTO paniers (client_id) VALUES (?)', [clientId]);
  return { id: created.insertId, client_id: clientId, actif: 1 };
}

async function lireItems(conn, panierId) {
  const [items] = await conn.query(
    `SELECT pi.id, pi.ouvrage_id, pi.quantite, pi.prix_unitaire, o.titre, o.auteur, o.stock
     FROM panier_items pi
     JOIN ouvrages o ON o.id = pi.ouvrage_id
     WHERE pi.panier_id = ?
     ORDER BY pi.id`,
    [panierId],
  );
  return items;
}

function presentPanier(panier, items) {
  const lignes = items.map((item) => ({
    id: item.id,
    ouvrageId: item.ouvrage_id,
    titre: item.titre,
    auteur: item.auteur,
    quantite: Number(item.quantite),
    prixUnitaire: item.prix_unitaire,
    stockDisponible: Number(item.stock),
    sousTotal: fromCents(toCents(item.prix_unitaire) * Number(item.quantite)),
  }));
  const total = fromCents(lignes.reduce((sum, ligne) => sum + toCents(ligne.sousTotal), 0));
  return {
    id: panier.id,
    actif: true,
    expireApresHeures: getConfig().panierExpirationHeures,
    items: lignes,
    total,
  };
}

export async function obtenirPanier(clientId) {
  return withTransaction(async (conn) => {
    await lockClient(conn, clientId);
    const panier = await panierActif(conn, clientId);
    const items = await lireItems(conn, panier.id);
    return presentPanier(panier, items);
  });
}

export async function ajouterItem(clientId, { ouvrageId, quantite }) {
  return withTransaction(async (conn) => {
    await lockClient(conn, clientId);
    const panier = await panierActif(conn, clientId);
    const [books] = await conn.query(
      'SELECT id, titre, prix, stock FROM ouvrages WHERE id = ? FOR UPDATE',
      [ouvrageId],
    );
    const book = books[0];
    if (!book || Number(book.stock) <= 0) {
      throw new HttpError(404, 'Ouvrage introuvable ou en rupture.');
    }
    const [existing] = await conn.query(
      'SELECT id, quantite, prix_unitaire FROM panier_items WHERE panier_id = ? AND ouvrage_id = ? FOR UPDATE',
      [panier.id, ouvrageId],
    );
    const deja = existing[0] ? Number(existing[0].quantite) : 0;
    const prochaine = deja + quantite;
    if (prochaine > Number(book.stock)) {
      throw new HttpError(409, `Stock insuffisant pour « ${book.titre} » (${book.stock} en rayon).`);
    }
    if (existing[0]) {
      await conn.query('UPDATE panier_items SET quantite = ? WHERE id = ?', [prochaine, existing[0].id]);
    } else {
      await conn.query(
        'INSERT INTO panier_items (panier_id, ouvrage_id, quantite, prix_unitaire) VALUES (?, ?, ?, ?)',
        [panier.id, ouvrageId, quantite, book.prix],
      );
    }
    await conn.query('UPDATE paniers SET updated_at = NOW() WHERE id = ?', [panier.id]);
    const items = await lireItems(conn, panier.id);
    return presentPanier(panier, items);
  });
}

export async function modifierQuantite(clientId, itemId, quantite) {
  return withTransaction(async (conn) => {
    await lockClient(conn, clientId);
    const panier = await panierActif(conn, clientId);
    const [rows] = await conn.query(
      `SELECT pi.id, pi.ouvrage_id, o.titre, o.stock
       FROM panier_items pi
       JOIN ouvrages o ON o.id = pi.ouvrage_id
       WHERE pi.id = ? AND pi.panier_id = ?
       FOR UPDATE`,
      [itemId, panier.id],
    );
    const item = rows[0];
    if (!item) throw new HttpError(404, 'Article introuvable dans le panier.');
    if (quantite > Number(item.stock)) {
      throw new HttpError(409, `Stock insuffisant pour « ${item.titre} » (${item.stock} en rayon).`);
    }
    await conn.query('UPDATE panier_items SET quantite = ? WHERE id = ?', [quantite, item.id]);
    await conn.query('UPDATE paniers SET updated_at = NOW() WHERE id = ?', [panier.id]);
    const items = await lireItems(conn, panier.id);
    return presentPanier(panier, items);
  });
}

export async function retirerItem(clientId, itemId) {
  return withTransaction(async (conn) => {
    await lockClient(conn, clientId);
    const panier = await panierActif(conn, clientId);
    const [result] = await conn.query(
      'DELETE FROM panier_items WHERE id = ? AND panier_id = ?',
      [itemId, panier.id],
    );
    if (result.affectedRows === 0) throw new HttpError(404, 'Article introuvable dans le panier.');
    await conn.query('UPDATE paniers SET updated_at = NOW() WHERE id = ?', [panier.id]);
    const items = await lireItems(conn, panier.id);
    return presentPanier(panier, items);
  });
}

export async function viderPanier(clientId) {
  return withTransaction(async (conn) => {
    await lockClient(conn, clientId);
    const panier = await panierActif(conn, clientId);
    await conn.query('DELETE FROM panier_items WHERE panier_id = ?', [panier.id]);
    await conn.query('UPDATE paniers SET updated_at = NOW() WHERE id = ?', [panier.id]);
    return presentPanier(panier, []);
  });
}

export async function expirerPaniersInactifs() {
  const heures = getConfig().panierExpirationHeures;
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id FROM paniers
       WHERE actif = 1 AND TIMESTAMPDIFF(HOUR, updated_at, NOW()) >= ?
       FOR UPDATE`,
      [heures],
    );
    if (!rows.length) return { expires: 0 };
    const ids = rows.map((row) => row.id);
    await conn.query('DELETE FROM panier_items WHERE panier_id IN (?)', [ids]);
    await conn.query('UPDATE paniers SET actif = 0, updated_at = updated_at WHERE id IN (?)', [ids]);
    return { expires: ids.length };
  });
}

export async function retirerOuvragesDuPanier(conn, clientId, ouvrageIds) {
  if (!ouvrageIds.length) return;
  const [rows] = await conn.query(
    'SELECT id FROM paniers WHERE client_id = ? AND actif = 1 ORDER BY id DESC LIMIT 1',
    [clientId],
  );
  if (!rows[0]) return;
  await conn.query(
    'DELETE FROM panier_items WHERE panier_id = ? AND ouvrage_id IN (?)',
    [rows[0].id, ouvrageIds],
  );
}

export async function lireLignesPanierPourCommande(conn, clientId) {
  await lockClient(conn, clientId);
  const panier = await panierActif(conn, clientId);
  const items = await lireItems(conn, panier.id);
  if (!items.length) throw new HttpError(400, 'Le panier est vide.');
  return items.map((item) => ({
    ouvrageId: item.ouvrage_id,
    quantite: Number(item.quantite),
    prixUnitaire: item.prix_unitaire,
    titre: item.titre,
    listeItemId: null,
  }));
}
