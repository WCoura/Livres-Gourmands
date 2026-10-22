import assert from 'node:assert/strict';
import { before, beforeEach, after, describe, test } from 'node:test';
import request from 'supertest';

process.env.DB_HOST = '127.0.0.1';
process.env.DB_USER = 'livres';
process.env.DB_PASSWORD = 'livres_dev';
process.env.DB_NAME = 'livresgourmands_test';
process.env.JWT_SECRET = 'test-jwt-livres-gourmands';
process.env.PANIER_EXPIRATION_HEURES = '72';

const adresse = '12 rue des Oliviers\n13001 Marseille\nFrance';

let app;

async function login(email, motDePasse) {
  const response = await request(app).post('/api/auth/login').send({ email, motDePasse });
  assert.equal(response.status, 200, response.body.erreur);
  return response.body.token;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

describe('API Livres Gourmands', { concurrency: 1 }, () => {
  before(async () => {
    const { resetDatabase } = await import('../scripts/setup-db.js');
    await resetDatabase();
    const { createApp } = await import('../src/app.js');
    app = createApp();
  });

  beforeEach(async () => {
    const { closePool } = await import('../src/db.js');
    const { resetDatabase } = await import('../scripts/setup-db.js');
    await closePool();
    await resetDatabase();
  });

  after(async () => {
    const { closePool } = await import('../src/db.js');
    await closePool();
  });

  test('santé, manifeste PWA et coquille', async () => {
    const health = await request(app).get('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);

    const page = await request(app).get('/').set('Accept', 'text/html');
    assert.equal(page.status, 200);
    assert.match(page.text, /Livres Gourmands/);

    const manifest = await request(app).get('/manifest.webmanifest');
    assert.equal(manifest.status, 200);
    assert.equal(manifest.body.name, 'Livres Gourmands');
    assert.equal(manifest.body.display, 'standalone');

    const worker = await request(app).get('/sw.js');
    assert.equal(worker.status, 200);
    assert.match(worker.text, /lg-shell-v1/);

    const icon = await request(app).get('/icons/icon-192.png');
    assert.equal(icon.status, 200);
  });

  test('inscription, connexion et profil', async () => {
    const bad = await request(app).post('/api/auth/register').send({
      nom: 'Martin', prenom: 'Léa', email: 'lea@example.com', motDePasse: 'court',
    });
    assert.equal(bad.status, 400);

    const created = await request(app).post('/api/auth/register').send({
      nom: 'Martin', prenom: 'Léa', email: 'Lea@Example.com', motDePasse: 'Recette123', role: 'administrateur',
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.utilisateur.role, 'client');
    assert.equal(created.body.utilisateur.email, 'lea@example.com');
    assert.ok(created.body.token);

    const me = await request(app).get('/api/users/me').set(bearer(created.body.token));
    assert.equal(me.status, 200);
    assert.equal(me.body.utilisateur.prenom, 'Léa');

    const wrong = await request(app).post('/api/auth/login').send({
      email: 'lea@example.com', motDePasse: 'mauvais',
    });
    assert.equal(wrong.status, 401);
  });

  test('le catalogue public cache les ruptures et filtre la recherche', async () => {
    const all = await request(app).get('/api/ouvrages?limite=48');
    assert.equal(all.status, 200);
    assert.ok(all.body.ouvrages.every((book) => book.stock > 0));
    assert.equal(all.body.ouvrages.some((book) => book.titre === 'Tartes sans détour'), false);

    const hidden = await request(app).get('/api/ouvrages/4');
    assert.equal(hidden.status, 404);

    const tartes = await request(app).get('/api/ouvrages').query({ texte: 'Tartes' });
    assert.equal(tartes.body.total, 0);

    const bouillon = await request(app).get('/api/ouvrages').query({ texte: 'Bouillon' });
    assert.equal(bouillon.body.total, 1);
    assert.equal(bouillon.body.ouvrages[0].titre, 'Bouillons clairs');

    const populaires = await request(app).get('/api/ouvrages').query({ populariteMin: 60, limite: 48 });
    assert.equal(populaires.body.total, 3);

    const debuter = await request(app).get('/api/ouvrages').query({ categorie: 5, limite: 48 });
    assert.equal(debuter.body.total, 2);

    const token = await login('sara.gestion@livresgourmands.test', 'Gestion123!');
    const interne = await request(app).get('/api/ouvrages/4').set(bearer(token));
    assert.equal(interne.status, 200);
    assert.equal(interne.body.ouvrage.stock, 0);

    const avecRupture = await request(app)
      .get('/api/ouvrages')
      .query({ inclureRupture: 1, limite: 48 })
      .set(bearer(token));
    assert.equal(avecRupture.body.ouvrages.some((book) => book.id === 4), true);

    const client = await login('camille.client@livresgourmands.test', 'Camille123!');
    const ignore = await request(app)
      .get('/api/ouvrages')
      .query({ inclureRupture: 1, limite: 48 })
      .set(bearer(client));
    assert.equal(ignore.body.ouvrages.some((book) => book.id === 4), false);
  });

  test('les rôles protègent les routes', async () => {
    const anon = await request(app).get('/api/users');
    assert.equal(anon.status, 401);
    const client = await login('camille.client@livresgourmands.test', 'Camille123!');
    const forbidden = await request(app).get('/api/users').set(bearer(client));
    assert.equal(forbidden.status, 403);
    const category = await request(app).post('/api/categories').set(bearer(client)).send({ nom: 'Intrus' });
    assert.equal(category.status, 403);
  });

  test('panier, paiement simulé et stock', async () => {
    const token = await login('camille.client@livresgourmands.test', 'Camille123!');
    const beforeBook = await request(app).get('/api/ouvrages/1');
    const stockAvant = beforeBook.body.ouvrage.stock;

    const panier = await request(app)
      .post('/api/panier/items')
      .set(bearer(token))
      .send({ ouvrageId: 1, quantite: 2 });
    assert.equal(panier.status, 201);
    assert.equal(panier.body.panier.items[0].quantite, 2);
    assert.equal(panier.body.panier.items[0].sousTotal, '49.80');
    assert.equal(panier.body.panier.total, '49.80');

    const banque = await request(app).post('/api/commandes').set(bearer(token)).send({
      adresseLivraison: adresse,
      modeLivraison: 'standard',
      modePaiement: 'carte_simulee',
      numeroCarte: '4242424242424242',
    });
    assert.equal(banque.status, 400);

    const commande = await request(app).post('/api/commandes').set(bearer(token)).send({
      adresseLivraison: adresse,
      modeLivraison: 'express',
      modePaiement: 'paypal_simule',
    });
    assert.equal(commande.status, 201);
    assert.equal(commande.body.commande.statut, 'en_attente_paiement');
    assert.equal(commande.body.commande.total, '49.80');
    const reference = commande.body.commande.paiement.reference;
    assert.match(reference, /^sim_/);

    const paye = await request(app).post(`/api/paiements/${reference}/simuler`).send({ resultat: 'reussi' });
    assert.equal(paye.status, 200, paye.body.erreur);
    assert.equal(paye.body.commande.statut, 'payee');
    assert.equal(paye.body.paiement.provider, 'simulation_paypal');
    assert.equal(paye.body.paiement.statut, 'reussi');

    const after = await request(app).get('/api/ouvrages/1').set(bearer(token));
    assert.equal(after.body.ouvrage.stock, stockAvant - 2);

    const vide = await request(app).get('/api/panier').set(bearer(token));
    assert.equal(vide.body.panier.items.length, 0);

    const avis = await request(app).post('/api/ouvrages/1/avis').set(bearer(token)).send({ note: 4 });
    assert.equal(avis.status, 201);
    const doublon = await request(app).post('/api/ouvrages/1/avis').set(bearer(token)).send({ note: 3 });
    assert.equal(doublon.status, 409);

    const sansAchat = await request(app).post('/api/ouvrages/2/avis').set(bearer(token)).send({ note: 5 });
    assert.equal(sansAchat.status, 403);

    const annule = await request(app).post(`/api/commandes/${commande.body.commande.id}/annuler`).set(bearer(token));
    assert.equal(annule.status, 200);
    assert.equal(annule.body.commande.statut, 'annulee');
    const restaure = await request(app).get('/api/ouvrages/1').set(bearer(token));
    assert.equal(restaure.body.ouvrage.stock, stockAvant);
  });

  test('un stock insuffisant au paiement n\'est pas décrémenté', async () => {
    const token = await login('camille.client@livresgourmands.test', 'Camille123!');
    await request(app).post('/api/panier/items').set(bearer(token)).send({ ouvrageId: 12, quantite: 2 });
    const commande = await request(app).post('/api/commandes').set(bearer(token)).send({
      adresseLivraison: adresse,
      modeLivraison: 'standard',
      modePaiement: 'carte_simulee',
    });
    assert.equal(commande.status, 201);
    const { getPool } = await import('../src/db.js');
    await getPool().query('UPDATE ouvrages SET stock = 0 WHERE id = 12');
    const reference = commande.body.commande.paiement.reference;
    const echec = await request(app).post(`/api/paiements/${reference}/simuler`).send({ resultat: 'reussi' });
    assert.equal(echec.status, 409);
    const suivi = await request(app).get(`/api/paiements/${reference}`);
    assert.equal(suivi.body.paiement.statut, 'echoue');
    assert.equal(suivi.body.commande.statut, 'en_attente_paiement');
    const stock = await getPool().query('SELECT stock FROM ouvrages WHERE id = 12');
    assert.equal(Number(stock[0][0].stock), 0);
  });

  test('commentaire en attente puis validation éditeur', async () => {
    const client = await login('camille.client@livresgourmands.test', 'Camille123!');
    const envoi = await request(app).post('/api/ouvrages/5/commentaires').set(bearer(client)).send({
      contenu: 'Le chapitre sur les juliennes est enfin lisible.',
    });
    assert.equal(envoi.status, 201);
    assert.equal(envoi.body.commentaire.statut, 'en_attente');

    const fiche = await request(app).get('/api/ouvrages/5');
    assert.equal(fiche.body.commentaires.some((item) => item.contenu.includes('juliennes')), false);

    const editeur = await login('louis.editeur@livresgourmands.test', 'Editeur123!');
    const file = await request(app).get('/api/commentaires').set(bearer(editeur));
    assert.ok(file.body.commentaires.some((item) => item.id === envoi.body.commentaire.id));
    const decision = await request(app)
      .put(`/api/commentaires/${envoi.body.commentaire.id}/valider`)
      .set(bearer(editeur))
      .send({ decision: 'valider' });
    assert.equal(decision.status, 200);

    const publie = await request(app).get('/api/ouvrages/5');
    assert.equal(publie.body.commentaires.some((item) => item.contenu.includes('juliennes')), true);

    const rejet = await request(app).post('/api/ouvrages/6/commentaires').set(bearer(client)).send({
      contenu: 'Trop salé à mon goût, mais la structure est nette.',
    });
    await request(app)
      .put(`/api/commentaires/${rejet.body.commentaire.id}/valider`)
      .set(bearer(editeur))
      .send({ decision: 'rejeter' });
    const sauces = await request(app).get('/api/ouvrages/6');
    assert.equal(sauces.body.commentaires.some((item) => item.contenu.includes('salé')), false);
  });

  test('liste de cadeaux consultable et achetable sans compte', async () => {
    const liste = await request(app).get('/api/listes/TABLE-HIVER');
    assert.equal(liste.status, 200);
    assert.equal(liste.body.liste.nom, 'Table d\'hiver');
    const item = liste.body.liste.items.find((row) => row.ouvrageId === 5);
    assert.ok(item);

    const { getPool } = await import('../src/db.js');
    const [avant] = await getPool().query('SELECT stock FROM ouvrages WHERE id = 5');

    const achat = await request(app).post('/api/listes/TABLE-HIVER/acheter').send({
      lignes: [{ listeItemId: item.id, quantite: 1 }],
      nom: 'Alex Renard',
      email: 'alex@example.com',
      adresseLivraison: adresse,
      modeLivraison: 'relais',
      modePaiement: 'carte_simulee',
    });
    assert.equal(achat.status, 201, achat.body.erreur);
    assert.equal(achat.body.commande.clientId, null);
    const reference = achat.body.commande.paiement.reference;
    const paye = await request(app).post(`/api/paiements/${reference}/simuler`).send({ resultat: 'reussi' });
    assert.equal(paye.status, 200, paye.body.erreur);

    const [apres] = await getPool().query('SELECT stock FROM ouvrages WHERE id = 5');
    assert.equal(Number(apres[0].stock), Number(avant[0].stock) - 1);
    const [offert] = await getPool().query('SELECT quantite_achetee FROM liste_items WHERE id = ?', [item.id]);
    assert.equal(Number(offert[0].quantite_achetee), 1);
  });

  test('un panier inactif est vidé', async () => {
    const token = await login('camille.client@livresgourmands.test', 'Camille123!');
    const ajoute = await request(app).post('/api/panier/items').set(bearer(token)).send({ ouvrageId: 2, quantite: 1 });
    const panierId = ajoute.body.panier.id;
    const { getPool } = await import('../src/db.js');
    await getPool().query('UPDATE paniers SET updated_at = NOW() - INTERVAL 100 HOUR WHERE id = ?', [panierId]);
    const frais = await request(app).get('/api/panier').set(bearer(token));
    assert.equal(frais.status, 200);
    assert.equal(frais.body.panier.items.length, 0);
    assert.notEqual(frais.body.panier.id, panierId);

    const { expirerPaniersInactifs } = await import('../src/services/panierService.js');
    await getPool().query('UPDATE paniers SET updated_at = NOW() - INTERVAL 100 HOUR WHERE id = ?', [frais.body.panier.id]);
    const result = await expirerPaniersInactifs();
    assert.equal(result.expires, 1);
  });

  test('suspension de compte et échec de paiement simulé', async () => {
    const admin = await login('noemie.admin@livresgourmands.test', 'Admin123!');
    const suspendu = await request(app).put('/api/users/1').set(bearer(admin)).send({ actif: false });
    assert.equal(suspendu.status, 200);
    assert.equal(suspendu.body.utilisateur.actif, false);
    const loginSuspendu = await request(app).post('/api/auth/login').send({
      email: 'camille.client@livresgourmands.test',
      motDePasse: 'Camille123!',
    });
    assert.equal(loginSuspendu.status, 403);

    await request(app).put('/api/users/1').set(bearer(admin)).send({ actif: true });
    const token = await login('camille.client@livresgourmands.test', 'Camille123!');
    await request(app).post('/api/panier/items').set(bearer(token)).send({ ouvrageId: 8, quantite: 1 });
    const commande = await request(app).post('/api/commandes').set(bearer(token)).send({
      adresseLivraison: adresse,
      modeLivraison: 'standard',
      modePaiement: 'carte_simulee',
    });
    const reference = commande.body.commande.paiement.reference;
    const { getPool } = await import('../src/db.js');
    const [stockAvant] = await getPool().query('SELECT stock FROM ouvrages WHERE id = 8');
    const echec = await request(app).post(`/api/paiements/${reference}/simuler`).send({ resultat: 'echoue' });
    assert.equal(echec.status, 200);
    assert.equal(echec.body.paiement.statut, 'echoue');
    const [stockApres] = await getPool().query('SELECT stock FROM ouvrages WHERE id = 8');
    assert.equal(Number(stockApres[0].stock), Number(stockAvant[0].stock));

    const ventes = await request(app).get('/api/ventes').set(bearer(admin));
    assert.equal(ventes.status, 200);
    assert.ok(ventes.body.nombreCommandes >= 1);
  });
});
