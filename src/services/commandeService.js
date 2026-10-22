import crypto from 'node:crypto';
import { getPool, withTransaction } from '../db.js';
import { HttpError } from '../errors.js';
import { fromCents, toCents } from '../money.js';
import { lireLignesPanierPourCommande, retirerOuvragesDuPanier } from './panierService.js';

const STATUTS_STOCK_PRIS = new Set(['payee', 'en_preparation', 'expediee', 'livree']);
const TRANSITIONS = {
  en_attente_paiement: new Set(['annulee']),
  payee: new Set(['en_preparation', 'expediee', 'annulee']),
  en_preparation: new Set(['expediee', 'annulee']),
  expediee: new Set(['livree']),
  livree: new Set(),
  annulee: new Set(),
};

function referencePaiement() {
  return `sim_${crypto.randomBytes(16).toString('hex')}`;
}

function providerDe(modePaiement) {
  return modePaiement === 'paypal_simule' ? 'simulation_paypal' : 'simulation_carte';
}

async function insererCommande(conn, {
  clientId,
  listeId,
  acheteurNom,
  acheteurEmail,
  adresseLivraison,
  modeLivraison,
  modePaiement,
  lignes,
}) {
  const livres = await verrouillerOuvrages(conn, lignes.map((ligne) => ligne.ouvrageId));
  for (const ligne of lignes) {
    const livre = livres.get(ligne.ouvrageId);
    if (!livre) throw new HttpError(404, 'Ouvrage introuvable.');
    if (Number(livre.stock) < ligne.quantite) {
      throw new HttpError(409, `Stock insuffisant pour « ${livre.titre} ».`);
    }
  }
  const total = fromCents(lignes.reduce((sum, ligne) => sum + toCents(ligne.prixUnitaire) * ligne.quantite, 0));
  const [commande] = await conn.query(
    `INSERT INTO commandes
      (client_id, liste_cadeaux_id, acheteur_nom, acheteur_email, total, statut,
       adresse_livraison, mode_livraison, mode_paiement)
     VALUES (?, ?, ?, ?, ?, 'en_attente_paiement', ?, ?, ?)`,
    [
      clientId,
      listeId,
      acheteurNom,
      acheteurEmail,
      total,
      adresseLivraison,
      modeLivraison,
      modePaiement,
    ],
  );
  for (const ligne of lignes) {
    await conn.query(
      `INSERT INTO commande_items (commande_id, ouvrage_id, quantite, prix_unitaire, liste_item_id)
       VALUES (?, ?, ?, ?, ?)`,
      [commande.insertId, ligne.ouvrageId, ligne.quantite, ligne.prixUnitaire, ligne.listeItemId],
    );
  }
  const paiement = await creerPaiement(conn, commande.insertId, modePaiement, total);
  return chargerCommande(conn, commande.insertId, paiement);
}

async function creerPaiement(conn, commandeId, modePaiement, total) {
  const reference = referencePaiement();
  const provider = providerDe(modePaiement);
  const [result] = await conn.query(
    `INSERT INTO payments (commande_id, provider, provider_payment_id, statut, amount)
     VALUES (?, ?, ?, 'initie', ?)`,
    [commandeId, provider, reference, total],
  );
  return {
    id: result.insertId,
    reference,
    provider,
    statut: 'initie',
    montant: total,
    url: `/paiement/${reference}`,
  };
}

async function verrouillerOuvrages(conn, ids) {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  const [rows] = await conn.query(
    'SELECT id, titre, stock, prix FROM ouvrages WHERE id IN (?) ORDER BY id FOR UPDATE',
    [unique],
  );
  return new Map(rows.map((row) => [row.id, row]));
}

async function chargerCommande(conn, id, paiement) {
  const db = conn || getPool();
  const [commandes] = await db.query('SELECT * FROM commandes WHERE id = ?', [id]);
  const commande = commandes[0];
  if (!commande) throw new HttpError(404, 'Commande introuvable.');
  const [items] = await db.query(
    `SELECT ci.id, ci.ouvrage_id, ci.quantite, ci.prix_unitaire, ci.liste_item_id, o.titre, o.auteur
     FROM commande_items ci
     JOIN ouvrages o ON o.id = ci.ouvrage_id
     WHERE ci.commande_id = ?
     ORDER BY ci.id`,
    [id],
  );
  const [payments] = await db.query(
    `SELECT id, provider, provider_payment_id, statut, amount, created_at
     FROM payments WHERE commande_id = ? ORDER BY id DESC`,
    [id],
  );
  return presentCommande(commande, items, payments, paiement);
}

function presentCommande(commande, items, payments, paiementCourant) {
  return {
    id: commande.id,
    clientId: commande.client_id,
    listeCadeauxId: commande.liste_cadeaux_id,
    acheteurNom: commande.acheteur_nom,
    acheteurEmail: commande.acheteur_email,
    date: commande.date_commande,
    total: commande.total,
    statut: commande.statut,
    adresseLivraison: commande.adresse_livraison,
    modeLivraison: commande.mode_livraison,
    modePaiement: commande.mode_paiement,
    lignes: items.map((item) => ({
      id: item.id,
      ouvrageId: item.ouvrage_id,
      titre: item.titre,
      auteur: item.auteur,
      quantite: Number(item.quantite),
      prixUnitaire: item.prix_unitaire,
      listeItemId: item.liste_item_id,
      sousTotal: fromCents(toCents(item.prix_unitaire) * Number(item.quantite)),
    })),
    paiements: payments.map(presentPaiement),
    paiement: paiementCourant || (payments[0] ? {
      ...presentPaiement(payments[0]),
      url: `/paiement/${payments[0].provider_payment_id}`,
    } : null),
  };
}

function presentPaiement(row) {
  return {
    id: row.id,
    provider: row.provider,
    reference: row.provider_payment_id,
    statut: row.statut,
    montant: row.amount,
    date: row.created_at,
    url: `/paiement/${row.provider_payment_id}`,
  };
}

export async function creerDepuisPanier(clientId, body) {
  return withTransaction(async (conn) => {
    const [users] = await conn.query(
      'SELECT prenom, nom, email FROM users WHERE id = ?',
      [clientId],
    );
    const user = users[0];
    const lignes = await lireLignesPanierPourCommande(conn, clientId);
    return insererCommande(conn, {
      clientId,
      listeId: null,
      acheteurNom: `${user.prenom} ${user.nom}`,
      acheteurEmail: user.email,
      adresseLivraison: body.adresseLivraison.trim(),
      modeLivraison: body.modeLivraison,
      modePaiement: body.modePaiement,
      lignes,
    });
  });
}

export async function creerDepuisListe(actor, liste, lignesDemandees, body) {
  return withTransaction(async (conn) => {
    const ids = [...new Set(lignesDemandees.map((ligne) => ligne.listeItemId))].sort((a, b) => a - b);
    if (ids.length !== lignesDemandees.length) {
      throw new HttpError(400, 'Chaque article ne peut apparaître qu\'une fois.');
    }
    const [items] = await conn.query(
      `SELECT li.id, li.liste_id, li.ouvrage_id, li.quantite_souhaitee, li.quantite_achetee, o.prix, o.titre
       FROM liste_items li
       JOIN ouvrages o ON o.id = li.ouvrage_id
       WHERE li.id IN (?) AND li.liste_id = ?
       ORDER BY li.id
       FOR UPDATE`,
      [ids, liste.id],
    );
    if (items.length !== ids.length) {
      throw new HttpError(400, 'Un des articles ne fait pas partie de cette liste.');
    }
    const parId = new Map(items.map((item) => [item.id, item]));
    const lignes = lignesDemandees.map((demande) => {
      const item = parId.get(demande.listeItemId);
      const reste = Number(item.quantite_souhaitee) - Number(item.quantite_achetee);
      if (demande.quantite > reste) {
        throw new HttpError(409, `Il ne reste que ${reste} exemplaire(s) à offrir pour « ${item.titre} ».`);
      }
      return {
        ouvrageId: item.ouvrage_id,
        quantite: demande.quantite,
        prixUnitaire: item.prix,
        titre: item.titre,
        listeItemId: item.id,
      };
    });
    let clientId = null;
    let acheteurNom = body.nom?.trim();
    let acheteurEmail = body.email?.toLowerCase();
    if (actor) {
      clientId = actor.id;
      acheteurNom = `${actor.prenom} ${actor.nom}`;
      acheteurEmail = actor.email;
    }
    if (!acheteurNom || !acheteurEmail) {
      throw new HttpError(400, 'Le nom et le courriel sont requis pour offrir sans compte.');
    }
    return insererCommande(conn, {
      clientId,
      listeId: liste.id,
      acheteurNom,
      acheteurEmail,
      adresseLivraison: body.adresseLivraison.trim(),
      modeLivraison: body.modeLivraison,
      modePaiement: body.modePaiement,
      lignes,
    });
  });
}

export async function lister(user) {
  const staff = user.role === 'gestionnaire' || user.role === 'administrateur';
  if (!staff && user.role !== 'client') {
    throw new HttpError(403, 'Rôle insuffisant pour consulter les commandes.');
  }
  const [rows] = staff
    ? await getPool().query('SELECT * FROM commandes ORDER BY date_commande DESC, id DESC')
    : await getPool().query(
      'SELECT * FROM commandes WHERE client_id = ? ORDER BY date_commande DESC, id DESC',
      [user.id],
    );
  const result = [];
  for (const row of rows) {
    result.push(await chargerCommande(null, row.id));
  }
  return result;
}

export async function obtenir(user, id) {
  const commande = await chargerCommande(null, id);
  const staff = user.role === 'gestionnaire' || user.role === 'administrateur';
  if (!staff && commande.clientId !== user.id) {
    throw new HttpError(403, 'Cette commande ne vous appartient pas.');
  }
  return commande;
}

export async function nouveauPaiement(user, commandeId) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM commandes WHERE id = ? FOR UPDATE', [commandeId]);
    const commande = rows[0];
    if (!commande) throw new HttpError(404, 'Commande introuvable.');
    if (commande.client_id !== user.id && user.role !== 'administrateur') {
      throw new HttpError(403, 'Cette commande ne vous appartient pas.');
    }
    if (commande.statut !== 'en_attente_paiement') {
      throw new HttpError(409, 'Cette commande n\'attend plus de paiement.');
    }
    const paiement = await creerPaiement(conn, commande.id, commande.mode_paiement, commande.total);
    return chargerCommande(conn, commande.id, paiement);
  });
}

export async function simulerPaiement(reference, resultat) {
  const outcome = await withTransaction(async (conn) => {
    const [payments] = await conn.query(
      'SELECT * FROM payments WHERE provider_payment_id = ? FOR UPDATE',
      [reference],
    );
    const payment = payments[0];
    if (!payment) throw new HttpError(404, 'Paiement introuvable.');
    if (payment.statut === 'reussi' || payment.statut === 'annule') {
      throw new HttpError(409, 'Ce paiement est déjà clos.');
    }
    const [commandes] = await conn.query(
      'SELECT * FROM commandes WHERE id = ? FOR UPDATE',
      [payment.commande_id],
    );
    const commande = commandes[0];
    if (!commande) throw new HttpError(404, 'Commande introuvable.');
    if (commande.statut !== 'en_attente_paiement') {
      throw new HttpError(409, 'La commande n\'est plus en attente de paiement.');
    }
    if (resultat === 'echoue') {
      await conn.query(`UPDATE payments SET statut = 'echoue' WHERE id = ?`, [payment.id]);
      return {
        echecStock: false,
        payload: {
          paiement: { ...presentPaiement({ ...payment, statut: 'echoue' }), url: `/paiement/${reference}` },
          commande: await chargerCommande(conn, commande.id),
        },
      };
    }

    const [lignes] = await conn.query(
      'SELECT ouvrage_id, quantite, liste_item_id FROM commande_items WHERE commande_id = ? ORDER BY ouvrage_id',
      [commande.id],
    );
    const livres = await verrouillerOuvrages(conn, lignes.map((ligne) => ligne.ouvrage_id));
    for (const ligne of lignes) {
      const livre = livres.get(ligne.ouvrage_id);
      if (!livre || Number(livre.stock) < Number(ligne.quantite)) {
        await conn.query(`UPDATE payments SET statut = 'echoue' WHERE id = ?`, [payment.id]);
        return {
          echecStock: true,
          message: `Stock insuffisant pour finaliser « ${livre?.titre || 'un ouvrage'} ».`,
        };
      }
    }
    for (const ligne of lignes) {
      const [updated] = await conn.query(
        `UPDATE ouvrages
         SET stock = stock - ?, popularite = popularite + ?
         WHERE id = ? AND stock >= ?`,
        [ligne.quantite, ligne.quantite, ligne.ouvrage_id, ligne.quantite],
      );
      if (updated.affectedRows !== 1) {
        throw new HttpError(409, 'Stock insuffisant au moment du paiement.');
      }
      if (ligne.liste_item_id) {
        const [listeUpdate] = await conn.query(
          `UPDATE liste_items
           SET quantite_achetee = quantite_achetee + ?
           WHERE id = ? AND quantite_achetee + ? <= quantite_souhaitee`,
          [ligne.quantite, ligne.liste_item_id, ligne.quantite],
        );
        if (listeUpdate.affectedRows !== 1) {
          throw new HttpError(409, 'La quantité demandée dépasse ce qu\'il reste sur la liste de cadeaux.');
        }
      }
    }
    await conn.query(`UPDATE payments SET statut = 'reussi' WHERE id = ?`, [payment.id]);
    await conn.query(`UPDATE commandes SET statut = 'payee' WHERE id = ?`, [commande.id]);
    if (commande.client_id) {
      await retirerOuvragesDuPanier(conn, commande.client_id, lignes.map((ligne) => ligne.ouvrage_id));
    }
    return {
      echecStock: false,
      payload: {
        paiement: { ...presentPaiement({ ...payment, statut: 'reussi' }), url: `/paiement/${reference}` },
        commande: await chargerCommande(conn, commande.id),
      },
    };
  });
  if (outcome.echecStock) throw new HttpError(409, outcome.message);
  return outcome.payload;
}

export async function consulterPaiement(reference) {
  const [rows] = await getPool().query(
    'SELECT * FROM payments WHERE provider_payment_id = ?',
    [reference],
  );
  if (!rows[0]) throw new HttpError(404, 'Paiement introuvable.');
  const commande = await chargerCommande(null, rows[0].commande_id);
  return {
    paiement: presentPaiement(rows[0]),
    commande: {
      id: commande.id,
      statut: commande.statut,
      total: commande.total,
      date: commande.date,
      modeLivraison: commande.modeLivraison,
      lignes: commande.lignes.map((ligne) => ({
        titre: ligne.titre,
        quantite: ligne.quantite,
        sousTotal: ligne.sousTotal,
      })),
    },
  };
}

export async function historiquePaiements(user) {
  const staff = user.role === 'administrateur' || user.role === 'gestionnaire';
  const [rows] = staff
    ? await getPool().query(
      `SELECT p.*, c.statut AS commande_statut, c.acheteur_nom
       FROM payments p JOIN commandes c ON c.id = p.commande_id
       ORDER BY p.created_at DESC, p.id DESC`,
    )
    : await getPool().query(
      `SELECT p.*, c.statut AS commande_statut, c.acheteur_nom
       FROM payments p JOIN commandes c ON c.id = p.commande_id
       WHERE c.client_id = ?
       ORDER BY p.created_at DESC, p.id DESC`,
      [user.id],
    );
  return rows.map((row) => ({
    ...presentPaiement(row),
    commandeId: row.commande_id,
    commandeStatut: row.commande_statut,
    acheteurNom: row.acheteur_nom,
  }));
}

async function restaurerStock(conn, commandeId) {
  const [lignes] = await conn.query(
    'SELECT ouvrage_id, quantite, liste_item_id FROM commande_items WHERE commande_id = ? ORDER BY ouvrage_id',
    [commandeId],
  );
  await verrouillerOuvrages(conn, lignes.map((ligne) => ligne.ouvrage_id));
  for (const ligne of lignes) {
    await conn.query(
      'UPDATE ouvrages SET stock = stock + ?, popularite = GREATEST(popularite - ?, 0) WHERE id = ?',
      [ligne.quantite, ligne.quantite, ligne.ouvrage_id],
    );
    if (ligne.liste_item_id) {
      await conn.query(
        'UPDATE liste_items SET quantite_achetee = GREATEST(quantite_achetee - ?, 0) WHERE id = ?',
        [ligne.quantite, ligne.liste_item_id],
      );
    }
  }
}

export async function annuler(user, id) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM commandes WHERE id = ? FOR UPDATE', [id]);
    const commande = rows[0];
    if (!commande) throw new HttpError(404, 'Commande introuvable.');
    const staff = user.role === 'gestionnaire' || user.role === 'administrateur';
    if (!staff && commande.client_id !== user.id) {
      throw new HttpError(403, 'Cette commande ne vous appartient pas.');
    }
    if (['expediee', 'livree', 'annulee'].includes(commande.statut)) {
      throw new HttpError(409, 'Cette commande ne peut plus être annulée.');
    }
    if (STATUTS_STOCK_PRIS.has(commande.statut)) {
      await restaurerStock(conn, commande.id);
    }
    await conn.query(
      `UPDATE payments SET statut = 'annule'
       WHERE commande_id = ? AND statut IN ('initie', 'reussi', 'echoue')`,
      [commande.id],
    );
    await conn.query(`UPDATE commandes SET statut = 'annulee' WHERE id = ?`, [commande.id]);
    return chargerCommande(conn, commande.id);
  });
}

export async function changerStatut(id, statut) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM commandes WHERE id = ? FOR UPDATE', [id]);
    const commande = rows[0];
    if (!commande) throw new HttpError(404, 'Commande introuvable.');
    const allowed = TRANSITIONS[commande.statut] || new Set();
    if (!allowed.has(statut)) {
      throw new HttpError(409, `Transition impossible de « ${commande.statut} » vers « ${statut} ».`);
    }
    if (statut === 'annulee' && STATUTS_STOCK_PRIS.has(commande.statut)) {
      await restaurerStock(conn, commande.id);
      await conn.query(
        `UPDATE payments SET statut = 'annule' WHERE commande_id = ? AND statut = 'reussi'`,
        [commande.id],
      );
    }
    await conn.query('UPDATE commandes SET statut = ? WHERE id = ?', [statut, id]);
    return chargerCommande(conn, id);
  });
}

export async function ventes({ du, au, categorieId }) {
  const params = [];
  let filtre = `cmd.statut IN ('payee', 'en_preparation', 'expediee', 'livree')`;
  if (du) {
    filtre += ' AND cmd.date_commande >= ?';
    params.push(du);
  }
  if (au) {
    filtre += ' AND cmd.date_commande < DATE_ADD(?, INTERVAL 1 DAY)';
    params.push(au);
  }
  if (categorieId) {
    filtre += ' AND o.categorie_id = ?';
    params.push(categorieId);
  }
  const [parCategorie] = await getPool().query(
    `SELECT c.id AS categorie_id, c.nom AS categorie,
            COALESCE(SUM(ci.quantite), 0) AS quantite,
            COALESCE(SUM(ci.quantite * ci.prix_unitaire), 0) AS total
     FROM commande_items ci
     JOIN commandes cmd ON cmd.id = ci.commande_id
     JOIN ouvrages o ON o.id = ci.ouvrage_id
     JOIN categories c ON c.id = o.categorie_id
     WHERE ${filtre}
     GROUP BY c.id, c.nom
     ORDER BY total DESC`,
    params,
  );
  const [globaux] = await getPool().query(
    `SELECT COUNT(DISTINCT cmd.id) AS nombre_commandes,
            COALESCE(SUM(ci.quantite * ci.prix_unitaire), 0) AS total
     FROM commande_items ci
     JOIN commandes cmd ON cmd.id = ci.commande_id
     JOIN ouvrages o ON o.id = ci.ouvrage_id
     WHERE ${filtre}`,
    params,
  );
  return {
    periode: { du: du || null, au: au || null, categorieId: categorieId || null },
    nombreCommandes: Number(globaux[0].nombre_commandes),
    totalVentes: fromCents(toCents(globaux[0].total)),
    parCategorie: parCategorie.map((row) => ({
      categorieId: row.categorie_id,
      categorie: row.categorie,
      quantite: Number(row.quantite),
      total: fromCents(toCents(row.total)),
    })),
  };
}
