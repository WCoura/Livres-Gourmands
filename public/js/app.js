import { api, ApiError } from './api.js';
import { esc, etoiles, euro, LIVRAISON, PAIEMENT, statutLabel } from './format.js';

const STAFF = new Set(['editeur', 'gestionnaire', 'administrateur']);
const state = { user: null, categories: [], cartCount: 0 };

const main = () => document.querySelector('#contenu');

function coverClass(categorieId) {
  return `cover cover-${categorieId || 1}`;
}

function navigate(url) {
  const next = new URL(url, location.origin);
  history.pushState({}, '', next.pathname + next.search);
  render();
}

function params() {
  return new URLSearchParams(location.search);
}

function setBanner(message, kind = 'ok') {
  const banner = document.querySelector('#banniere');
  if (!message) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }
  banner.hidden = false;
  banner.dataset.kind = kind;
  banner.textContent = message;
}

function loading(title = 'Chargement…') {
  main().innerHTML = `<p class="state">${esc(title)}</p>`;
}

function failure(error, retryHref = location.pathname) {
  main().innerHTML = `
    <section class="sheet narrow">
      <p class="kicker">Ça n'a pas abouti</p>
      <h1>La page ne s'est pas chargée.</h1>
      <p class="state-error">${esc(error.message)}</p>
      <p><a class="button" href="${esc(retryHref)}">Réessayer</a></p>
    </section>`;
}

function paintChrome() {
  const account = document.querySelector('#compte-slot');
  const atelier = document.querySelector('[data-slot="atelier"]');
  const count = document.querySelector('#panier-count');
  count.textContent = String(state.cartCount);
  atelier.hidden = !(state.user && STAFF.has(state.user.role));
  if (!state.user) {
    account.innerHTML = '<a href="/connexion">Connexion</a>';
  } else {
    account.innerHTML = `<a href="/compte">${esc(state.user.prenom)}</a> <button type="button" class="secondary" data-action="logout">Sortir</button>`;
  }
  const path = location.pathname;
  document.querySelectorAll('.nav a').forEach((link) => {
    const href = link.getAttribute('href');
    const current = href === '/' ? path === '/' : path.startsWith(href);
    if (current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const query = params().get('texte') || '';
  const input = document.querySelector('#q');
  if (document.activeElement !== input) input.value = query;
}

async function refreshCart() {
  if (!state.user || state.user.role !== 'client') {
    state.cartCount = 0;
    return;
  }
  try {
    const data = await api('/api/panier');
    state.cartCount = data.panier.items.reduce((sum, item) => sum + item.quantite, 0);
  } catch {
    state.cartCount = 0;
  }
}

function bookCard(book) {
  const letter = esc(book.titre.slice(0, 1));
  const low = book.stock > 0 && book.stock <= 3 ? `${book.stock} en rayon` : `${book.stock} en rayon`;
  return `
    <article class="card">
      <a class="${coverClass(book.categorie.id)}" href="/ouvrages/${book.id}">
        <span class="cover-kicker">${esc(book.categorie.nom || 'Cuisine')}</span>
        <span class="cover-letter">${letter}</span>
      </a>
      <div class="card-body">
        <h2><a href="/ouvrages/${book.id}">${esc(book.titre)}</a></h2>
        <p class="author">${esc(book.auteur)}</p>
        <p class="price-row"><span class="price">${euro(book.prix)}</span><span class="muted">${esc(low)}</span></p>
      </div>
    </article>`;
}

async function viewHome() {
  loading('Le catalogue arrive…');
  const query = params();
  const search = new URLSearchParams();
  if (query.get('texte')) search.set('texte', query.get('texte'));
  if (query.get('categorie')) search.set('categorie', query.get('categorie'));
  if (query.get('populariteMin')) search.set('populariteMin', query.get('populariteMin'));
  const [data] = await Promise.all([
    api(`/api/ouvrages?${search.toString()}`),
    state.categories.length ? null : api('/api/categories').then((body) => { state.categories = body.categories; }),
  ]);
  const categorie = query.get('categorie') || '';
  const chips = [`<a class="chip ${categorie ? '' : 'active'}" href="/">Tout le rayon</a>`]
    .concat(state.categories.map((item) => {
      const href = `/?categorie=${item.id}${query.get('texte') ? `&texte=${encodeURIComponent(query.get('texte'))}` : ''}`;
      return `<a class="chip ${String(item.id) === categorie ? 'active' : ''}" href="${href}">${esc(item.nom)}</a>`;
    }))
    .join('');
  const popular = query.get('populariteMin') === '50';
  const books = data.ouvrages.length
    ? `<div class="grid">${data.ouvrages.map(bookCard).join('')}</div>`
    : `<section class="sheet"><h2>Aucun ouvrage en stock ne correspond.</h2><p>Essayez un autre mot, ou revenez au rayon complet. Les titres épuisés ne s'affichent pas ici.</p><p><a class="button secondary" href="/">Voir tout le catalogue</a></p></section>`;
  main().innerHTML = `
    <section class="hero">
      <div>
        <p class="kicker">Librairie de cuisine</p>
        <h1>Des livres pour le premier œuf au plat comme pour le service du samedi.</h1>
        <p class="lede">Débutants, amateurs, chefs : le catalogue public ne montre que les ouvrages encore en rayon.</p>
      </div>
      <p class="note">${data.total} titre${data.total > 1 ? 's' : ''} disponible${data.total > 1 ? 's' : ''}. <a href="${popular ? '/' : '/?populariteMin=50'}">${popular ? 'Voir tout' : 'Les plus demandés'}</a></p>
    </section>
    <div class="chips">${chips}</div>
    ${books}`;
}

async function viewDetail(id) {
  loading('Ouverture de la fiche…');
  const data = await api(`/api/ouvrages/${id}`);
  const book = data.ouvrage;
  const avis = data.avis.length
    ? data.avis.map((item) => `<article class="line"><div><strong>${esc(item.auteur)}</strong> <span class="stars">${etoiles(item.note)}</span><p class="muted">${esc(item.date)}</p></div></article>`).join('')
    : '<p class="muted">Pas encore d\'avis publié.</p>';
  const commentaires = data.commentaires.length
    ? data.commentaires.map((item) => `<article class="line"><div><strong>${esc(item.auteur)}</strong><p>${esc(item.contenu)}</p><p class="muted">${esc(item.date)}</p></div></article>`).join('')
    : '<p class="muted">Aucun commentaire validé pour l\'instant.</p>';
  const forms = state.user?.role === 'client' ? `
    <form class="panel" data-action="avis" data-id="${book.id}">
      <h3>Laisser un avis</h3>
      <p class="muted">Réservé à celles et ceux qui ont déjà acheté ce titre.</p>
      <div class="field"><label for="note">Note de 1 à 5</label><input id="note" name="note" type="number" min="1" max="5" value="5" required></div>
      <button type="submit">Publier l'avis</button>
    </form>
    <form class="panel" data-action="commentaire" data-id="${book.id}">
      <h3>Proposer un commentaire</h3>
      <p class="muted">Il reste invisible tant qu'un éditeur ne l'a pas validé.</p>
      <div class="field"><label for="contenu">Commentaire</label><textarea id="contenu" name="contenu" rows="4" required minlength="4"></textarea></div>
      <button type="submit" class="secondary">Envoyer à l'éditeur</button>
    </form>` : '<p class="muted"><a href="/connexion">Connectez-vous</a> avec un compte client pour donner un avis ou un commentaire.</p>';
  main().innerHTML = `
    <article class="detail">
      <a class="${coverClass(book.categorie.id)}" href="/ouvrages/${book.id}">
        <span class="cover-kicker">${esc(book.categorie.nom || '')}</span>
        <span class="cover-letter">${esc(book.titre.slice(0, 1))}</span>
      </a>
      <div class="sheet">
        <p class="kicker">${esc(book.categorie.nom || '')}</p>
        <h1>${esc(book.titre)}</h1>
        <p class="lede">${esc(book.auteur)} · ISBN ${esc(book.isbn)}</p>
        <p>${esc(book.description || '')}</p>
        <p class="price-row"><span class="price">${euro(book.prix)}</span><span>${book.stock} en rayon</span></p>
        <p class="stars">${data.noteMoyenne ? `${etoiles(Math.round(data.noteMoyenne))} ${data.noteMoyenne}/5` : 'Pas encore de note'}</p>
        <form data-action="ajouter-panier" data-id="${book.id}" class="actions">
          <label>Quantité <input name="quantite" type="number" min="1" max="${book.stock}" value="1" style="width:5rem"></label>
          <button type="submit">Ajouter au panier</button>
        </form>
      </div>
    </article>
    <section class="sheet panel"><h2>Avis</h2>${avis}${forms}</section>
    <section class="sheet panel"><h2>Commentaires publiés</h2>${commentaires}</section>`;
}

function authShell(title, lede, form) {
  main().innerHTML = `
    <section class="sheet narrow">
      <p class="kicker">Compte</p>
      <h1>${title}</h1>
      <p class="lede">${lede}</p>
      ${form}
      <aside class="note panel">
        Comptes de démonstration locaux : camille.client@livresgourmands.test / Camille123!,
        louis.editeur@livresgourmands.test / Editeur123!,
        sara.gestion@livresgourmands.test / Gestion123!,
        noemie.admin@livresgourmands.test / Admin123!.
      </aside>
    </section>`;
}

function viewLogin() {
  authShell('Reprendre sa place en cuisine.', 'Le même compte sert au panier, aux commandes et aux avis.', `
    <form data-action="login">
      <div class="field"><label for="email">Courriel</label><input id="email" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="motDePasse">Mot de passe</label><input id="motDePasse" name="motDePasse" type="password" autocomplete="current-password" required></div>
      <div class="actions"><button type="submit">Se connecter</button><a class="button secondary" href="/inscription">Créer un compte</a></div>
    </form>`);
}

function viewRegister() {
  authShell('Ouvrir un compte client.', 'L\'inscription crée un compte client. Les rôles d\'atelier ne se choisissent pas ici.', `
    <form data-action="register">
      <div class="split">
        <div class="field"><label for="prenom">Prénom</label><input id="prenom" name="prenom" required></div>
        <div class="field"><label for="nom">Nom</label><input id="nom" name="nom" required></div>
      </div>
      <div class="field"><label for="email">Courriel</label><input id="email" name="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="motDePasse">Mot de passe</label><input id="motDePasse" name="motDePasse" type="password" autocomplete="new-password" minlength="8" required></div>
      <button type="submit">Créer le compte</button>
    </form>`);
}

async function viewCart() {
  if (!requireClient()) return;
  loading('On ouvre le panier…');
  const data = await api('/api/panier');
  state.cartCount = data.panier.items.reduce((sum, item) => sum + item.quantite, 0);
  paintChrome();
  if (!data.panier.items.length) {
    main().innerHTML = `<section class="sheet narrow"><p class="kicker">Panier</p><h1>Rien à glisser dans le sac.</h1><p>Les livres de cuisine n'attendent que vous dans le catalogue. Un panier inactif depuis ${data.panier.expireApresHeures} heures est vidé.</p><p><a class="button" href="/">Voir le catalogue</a></p></section>`;
    return;
  }
  const lines = data.panier.items.map((item) => `
    <article class="line">
      <div>
        <h3><a href="/ouvrages/${item.ouvrageId}">${esc(item.titre)}</a></h3>
        <p class="muted">${esc(item.auteur)} · ${euro(item.prixUnitaire)}</p>
        <form data-action="quantite-panier" data-id="${item.id}" class="actions">
          <label>Qté <input name="quantite" type="number" min="1" max="${item.stockDisponible}" value="${item.quantite}" style="width:5rem"></label>
          <button type="submit" class="secondary">Mettre à jour</button>
          <button type="button" class="secondary" data-action="retirer-panier" data-id="${item.id}">Retirer</button>
        </form>
      </div>
      <strong>${euro(item.sousTotal)}</strong>
    </article>`).join('');
  main().innerHTML = `
    <section class="sheet">
      <p class="kicker">Panier</p>
      <h1>Prêt pour la commande</h1>
      ${lines}
      <p class="price-row"><span>Total</span><span class="price">${euro(data.panier.total)}</span></p>
      <p><a class="button" href="/commande">Choisir la livraison</a></p>
    </section>`;
}

function addressFields() {
  return `
    <div class="field"><label for="rue">Rue</label><input id="rue" name="rue" required autocomplete="street-address" placeholder="Numéro et rue"></div>
    <div class="split">
      <div class="field"><label for="codePostal">Code postal</label><input id="codePostal" name="codePostal" required autocomplete="postal-code" placeholder="Code postal"></div>
      <div class="field"><label for="ville">Ville</label><input id="ville" name="ville" required autocomplete="address-level2" placeholder="Ville"></div>
    </div>
    <div class="field"><label for="pays">Pays</label><input id="pays" name="pays" value="France" required></div>
    <div class="field"><label for="modeLivraison">Livraison</label>
      <select id="modeLivraison" name="modeLivraison">
        <option value="standard">Standard — 4 à 6 jours</option>
        <option value="express">Express — le lendemain</option>
        <option value="relais">Point relais — 3 à 5 jours</option>
      </select>
    </div>
    <div class="field"><label for="modePaiement">Paiement simulé</label>
      <select id="modePaiement" name="modePaiement">
        <option value="carte_simulee">Carte (simulation)</option>
        <option value="paypal_simule">PayPal (simulation)</option>
      </select>
    </div>
    <p class="note">Aucune donnée bancaire n'est demandée. Seule une référence de prestataire sera conservée.</p>`;
}

function viewCheckout() {
  if (!requireClient()) return;
  main().innerHTML = `
    <section class="sheet narrow">
      <p class="kicker">Commande</p>
      <h1>Adresse et livraison</h1>
      <form data-action="commander">
        ${addressFields()}
        <button type="submit">Créer la commande</button>
      </form>
    </section>`;
}

async function viewPayment(reference) {
  loading('Lecture du paiement simulé…');
  const data = await api(`/api/paiements/${reference}`, { auth: false });
  const closed = data.paiement.statut === 'reussi' || data.paiement.statut === 'annule';
  const actions = closed ? '' : `
    <div class="actions">
      <button type="button" data-action="simuler" data-reference="${esc(reference)}" data-resultat="reussi">Simuler un paiement réussi</button>
      <button type="button" class="secondary" data-action="simuler" data-reference="${esc(reference)}" data-resultat="echoue">Simuler un échec</button>
    </div>`;
  const lines = data.commande.lignes.map((ligne) => `<p>${esc(ligne.quantite)} × ${esc(ligne.titre)} — ${euro(ligne.sousTotal)}</p>`).join('');
  main().innerHTML = `
    <section class="sheet narrow">
      <p class="kicker">Paiement simulé</p>
      <h1>${esc(statutLabel(data.commande.statut))}</h1>
      <p>Référence prestataire : <strong>${esc(data.paiement.reference)}</strong></p>
      <p>Statut du paiement : ${esc(data.paiement.statut)} · ${euro(data.paiement.montant)}</p>
      ${lines}
      <p class="muted">Livraison : ${esc(LIVRAISON[data.commande.modeLivraison] || data.commande.modeLivraison)}</p>
      ${actions}
      <p class="panel"><a href="/compte">Voir mes commandes</a></p>
    </section>`;
}

async function viewAccount() {
  if (!state.user) {
    navigate('/connexion');
    return;
  }
  loading('Chargement du compte…');
  const isClient = state.user.role === 'client';
  const commandes = isClient ? (await api('/api/commandes')).commandes : [];
  const paiements = isClient ? (await api('/api/paiements/me')).paiements : [];
  const orderHtml = !isClient
    ? '<p>Ce compte ouvre l\'atelier plutôt que le panier client.</p>'
    : commandes.length
      ? commandes.map((commande) => `
        <article class="line">
          <div>
            <h3><a href="/commandes/${commande.id}">Commande ${commande.id}</a></h3>
            <p><span class="badge">${esc(statutLabel(commande.statut))}</span> ${euro(commande.total)}</p>
            <p class="muted">${esc(commande.date)} · ${esc(LIVRAISON[commande.modeLivraison] || '')}</p>
          </div>
          ${['expediee', 'livree', 'annulee'].includes(commande.statut) ? '' : `<button type="button" class="secondary" data-action="annuler" data-id="${commande.id}">Annuler</button>`}
        </article>`).join('')
      : '<p>Aucune commande pour l\'instant. Le catalogue est le plus court chemin.</p>';
  const paymentsHtml = paiements.length
    ? `<h2>Paiements</h2>${paiements.map((item) => `<p>${esc(item.date)} · ${esc(item.statut)} · ${euro(item.montant)} · ${esc(item.reference)}</p>`).join('')}`
    : '';
  main().innerHTML = `
    <section class="sheet">
      <p class="kicker">${esc(state.user.role)}</p>
      <h1>${esc(state.user.prenom)} ${esc(state.user.nom)}</h1>
      <form data-action="profil" class="panel">
        <div class="split">
          <div class="field"><label for="prenom">Prénom</label><input id="prenom" name="prenom" value="${esc(state.user.prenom)}" required></div>
          <div class="field"><label for="nom">Nom</label><input id="nom" name="nom" value="${esc(state.user.nom)}" required></div>
        </div>
        <div class="field"><label for="email">Courriel</label><input id="email" name="email" type="email" value="${esc(state.user.email)}" required></div>
        <div class="field"><label for="motDePasse">Nouveau mot de passe (optionnel)</label><input id="motDePasse" name="motDePasse" type="password" autocomplete="new-password"></div>
        <button type="submit">Enregistrer le profil</button>
      </form>
      <h2>Commandes</h2>
      ${orderHtml}
      ${paymentsHtml}
    </section>`;
}

async function viewOrder(id) {
  if (!state.user) return navigate('/connexion');
  loading('Suivi de la commande…');
  const data = await api(`/api/commandes/${id}`);
  const commande = data.commande;
  const lines = commande.lignes.map((ligne) => `<p>${ligne.quantite} × ${esc(ligne.titre)} — ${euro(ligne.sousTotal)}</p>`).join('');
  const pay = commande.paiement && commande.statut === 'en_attente_paiement'
    ? `<p><a class="button" href="${esc(commande.paiement.url)}">Reprendre le paiement simulé</a></p>`
    : '';
  main().innerHTML = `
    <section class="sheet narrow">
      <p class="kicker">Suivi</p>
      <h1>Commande ${commande.id}</h1>
      <p><span class="badge">${esc(statutLabel(commande.statut))}</span></p>
      ${lines}
      <p>Total ${euro(commande.total)}</p>
      <p class="muted">${esc(commande.adresseLivraison).replaceAll('\n', '<br>')}</p>
      <p class="muted">${esc(PAIEMENT[commande.modePaiement] || commande.modePaiement)}</p>
      ${pay}
    </section>`;
}

async function viewLists() {
  loading('Listes de cadeaux…');
  let mine = [];
  if (state.user?.role === 'client') {
    mine = (await api('/api/listes')).listes;
  }
  if (!state.categories.length) state.categories = (await api('/api/categories')).categories;
  const catalogue = await api('/api/ouvrages?limite=48');
  const options = catalogue.ouvrages.map((book) => `<option value="${book.id}">${esc(book.titre)} — ${euro(book.prix)}</option>`).join('');
  const cards = mine.length
    ? mine.map((liste) => `
      <article class="sheet panel">
        <h2>${esc(liste.nom)}</h2>
        <p>Code à partager : <strong>${esc(liste.codePartage)}</strong></p>
        <p><a href="/listes/${esc(liste.codePartage)}">Ouvrir la liste</a></p>
        <ul>${liste.items.map((item) => `<li>${esc(item.titre)} — ${item.quantiteAchetee}/${item.quantiteSouhaitee}</li>`).join('') || '<li>Liste vide.</li>'}</ul>
      </article>`).join('')
    : '<p>Vous n\'avez pas encore de liste. Le code TABLE-HIVER ouvre un exemple déjà en rayon.</p>';
  const create = state.user?.role === 'client' ? `
    <form class="sheet" data-action="creer-liste">
      <h2>Nouvelle liste</h2>
      <div class="field"><label for="nom-liste">Nom</label><input id="nom-liste" name="nom" required placeholder="Table d'anniversaire"></div>
      <div class="field"><label for="ouvrage-liste">Ouvrage</label><select id="ouvrage-liste" name="ouvrageId">${options}</select></div>
      <div class="field"><label for="qte-liste">Quantité souhaitée</label><input id="qte-liste" name="quantiteSouhaitee" type="number" min="1" value="1"></div>
      <button type="submit">Créer et générer un code</button>
    </form>` : '<p><a href="/connexion">Connectez-vous</a> pour créer une liste. Un proche peut consulter un code sans compte.</p>';
  main().innerHTML = `
    <section class="hero">
      <div>
        <p class="kicker">Cadeaux</p>
        <h1>Une liste à glisser dans une carte.</h1>
        <p class="lede">Le code se partage tel quel. La personne qui l'ouvre n'a pas besoin d'un compte pour offrir un titre.</p>
      </div>
    </section>
    <form class="search" data-action="ouvrir-code">
      <label class="sr-only" for="code">Code de liste</label>
      <input id="code" name="code" placeholder="Code reçu" required>
      <button type="submit">Ouvrir</button>
    </form>
    ${cards}
    ${create}`;
}

async function viewGift(code) {
  loading('Recherche de la liste…');
  const data = await api(`/api/listes/${encodeURIComponent(code)}`, { auth: false });
  const liste = data.liste;
  if (!liste.items.length) {
    main().innerHTML = `<section class="sheet narrow"><h1>${esc(liste.nom)}</h1><p>Tous les titres encore disponibles ont déjà été offerts, ou ils sont en rupture.</p></section>`;
    return;
  }
  const rows = liste.items.map((item) => `
    <label class="line">
      <span><input type="checkbox" name="item" value="${item.id}" data-max="${item.reste}"> ${esc(item.titre)} — ${euro(item.prix)} · reste ${item.reste}</span>
      <input name="q-${item.id}" type="number" min="1" max="${Math.min(item.reste, item.stock)}" value="1" style="width:5rem">
    </label>`).join('');
  const guest = state.user ? '' : `
    <div class="field"><label for="nom">Votre nom</label><input id="nom" name="nom" required></div>
    <div class="field"><label for="email">Votre courriel</label><input id="email" name="email" type="email" required></div>`;
  main().innerHTML = `
    <section class="sheet">
      <p class="kicker">Liste de ${esc(liste.proprietaire)}</p>
      <h1>${esc(liste.nom)}</h1>
      <p class="muted">Code ${esc(liste.codePartage)}</p>
      <form data-action="acheter-liste" data-id="${esc(liste.id)}">
        ${rows}
        ${guest}
        ${addressFields()}
        <button type="submit">Offrir la sélection</button>
      </form>
    </section>`;
}

async function viewAtelier() {
  if (!state.user || !STAFF.has(state.user.role)) {
    main().innerHTML = `<section class="sheet narrow"><h1>Atelier réservé.</h1><p>Cette pièce est ouverte aux éditeurs, gestionnaires et administrateurs.</p><p><a class="button" href="/connexion">Se connecter</a></p></section>`;
    return;
  }
  loading('Ouverture de l\'atelier…');
  const role = state.user.role;
  const parts = [];
  if (role === 'editeur' || role === 'administrateur') {
    const comments = await api('/api/commentaires?statut=en_attente');
    const rows = comments.commentaires.length
      ? comments.commentaires.map((item) => `
        <article class="line">
          <div><h3>${esc(item.titre)}</h3><p>${esc(item.contenu)}</p><p class="muted">${esc(item.auteur)} · ${esc(item.dateSoumission)}</p></div>
          <div class="actions">
            <button type="button" data-action="decider" data-id="${item.id}" data-decision="valider">Valider</button>
            <button type="button" class="secondary" data-action="decider" data-id="${item.id}" data-decision="rejeter">Rejeter</button>
          </div>
        </article>`).join('')
      : '<p>Aucun commentaire en attente. La file est vide.</p>';
    parts.push(`<section class="sheet"><h2>Commentaires à relire</h2>${rows}</section>`);
  }
  if (role === 'editeur' || role === 'gestionnaire' || role === 'administrateur') {
    const books = await api('/api/ouvrages?inclureRupture=1&limite=48');
    if (!state.categories.length) state.categories = (await api('/api/categories')).categories;
    const options = state.categories.map((item) => `<option value="${item.id}">${esc(item.nom)}</option>`).join('');
    const table = books.ouvrages.map((book) => `
      <tr>
        <td data-label="Titre">${esc(book.titre)}</td>
        <td data-label="Stock">${book.stock}</td>
        <td data-label="Prix">${euro(book.prix)}</td>
        <td data-label="Action"><button type="button" class="secondary" data-action="choisir-livre" data-livre="${esc(JSON.stringify(book))}">Modifier</button></td>
      </tr>`).join('');
    parts.push(`
      <section class="sheet">
        <h2>Catalogue</h2>
        <div class="table-wrap"><table><thead><tr><th>Titre</th><th>Stock</th><th>Prix</th><th></th></tr></thead><tbody>${table}</tbody></table></div>
        <form data-action="sauver-livre" class="panel" id="forme-livre">
          <h3>Fiche ouvrage</h3>
          <input type="hidden" name="id">
          <div class="field"><label>Titre</label><input name="titre" required></div>
          <div class="field"><label>Auteur</label><input name="auteur" required></div>
          <div class="field"><label>ISBN</label><input name="isbn" required></div>
          <div class="field"><label>Description</label><textarea name="description" rows="3"></textarea></div>
          <div class="split">
            <div class="field"><label>Prix</label><input name="prix" type="number" min="0" step="0.01" required></div>
            <div class="field"><label>Stock</label><input name="stock" type="number" min="0" step="1" required></div>
          </div>
          <div class="field"><label>Catégorie</label><select name="categorieId">${options}</select></div>
          <div class="actions"><button type="submit">Enregistrer</button><button type="button" class="secondary" data-action="nouveau-livre">Nouveau</button></div>
        </form>
        <form data-action="sauver-categorie" class="panel">
          <h3>Nouvelle catégorie</h3>
          <div class="field"><label>Nom</label><input name="nom" required></div>
          <div class="field"><label>Description</label><input name="description"></div>
          <button type="submit" class="secondary">Ajouter la catégorie</button>
        </form>
      </section>`);
  }
  if (role === 'gestionnaire' || role === 'administrateur') {
    const [orders, sales] = await Promise.all([api('/api/commandes'), api('/api/ventes')]);
    const salesHtml = sales.parCategorie.length
      ? sales.parCategorie.map((row) => `<p>${esc(row.categorie)} · ${row.quantite} ex. · ${euro(row.total)}</p>`).join('')
      : '<p>Aucune vente payée sur la période.</p>';
    const orderRows = orders.commandes.length
      ? orders.commandes.map((commande) => `
        <tr>
          <td data-label="Commande">${commande.id}</td>
          <td data-label="Client">${esc(commande.acheteurNom)}</td>
          <td data-label="Statut">${esc(statutLabel(commande.statut))}</td>
          <td data-label="Total">${euro(commande.total)}</td>
          <td data-label="Suite">
            <form data-action="statut-commande" data-id="${commande.id}" class="actions">
              <select name="statut">
                ${['en_preparation', 'expediee', 'livree', 'annulee'].map((statut) => `<option value="${statut}">${esc(statutLabel(statut))}</option>`).join('')}
              </select>
              <button type="submit" class="secondary">Mettre à jour</button>
            </form>
          </td>
        </tr>`).join('')
      : '';
    parts.push(`<section class="sheet"><h2>Ventes</h2><p>${sales.nombreCommandes} commande(s) · ${euro(sales.totalVentes)}</p>${salesHtml}</section>`);
    parts.push(`<section class="sheet"><h2>Commandes</h2>${orderRows ? `<div class="table-wrap"><table><tbody>${orderRows}</tbody></table></div>` : '<p>Aucune commande.</p>'}</section>`);
  }
  if (role === 'administrateur') {
    const [users, payments] = await Promise.all([api('/api/users'), api('/api/paiements')]);
    const userRows = users.utilisateurs.map((user) => `
      <tr>
        <td data-label="Nom">${esc(user.prenom)} ${esc(user.nom)}</td>
        <td data-label="Rôle">${esc(user.role)}</td>
        <td data-label="État">${user.actif ? 'Actif' : 'Suspendu'}</td>
        <td data-label="Action">${user.id === state.user.id ? '' : `<button type="button" class="secondary" data-action="suspendre" data-id="${user.id}" data-actif="${user.actif ? '0' : '1'}">${user.actif ? 'Suspendre' : 'Réactiver'}</button>`}</td>
      </tr>`).join('');
    const payRows = payments.paiements.length
      ? payments.paiements.map((item) => `<p>${esc(item.date)} · ${esc(item.acheteurNom)} · ${esc(item.statut)} · ${euro(item.montant)} · ${esc(item.reference)}</p>`).join('')
      : '<p>Aucun paiement enregistré.</p>';
    parts.push(`<section class="sheet"><h2>Comptes</h2><div class="table-wrap"><table><tbody>${userRows}</tbody></table></div></section>`);
    parts.push(`<section class="sheet"><h2>Transactions</h2><p class="muted">Références prestataire seulement — pas de données de carte.</p>${payRows}</section>`);
  }
  main().innerHTML = `<p class="kicker">Atelier</p><h1>Tenir la librairie</h1>${parts.join('')}`;
}

function requireClient() {
  if (!state.user) {
    navigate('/connexion');
    return false;
  }
  if (state.user.role !== 'client') {
    main().innerHTML = `<section class="sheet narrow"><h1>Panier réservé aux clients.</h1><p>Ce compte d'atelier ne passe pas commande. Ouvrez un compte client, ou entrez dans l'atelier.</p></section>`;
    return false;
  }
  return true;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showFormError(form, error) {
  let box = form.querySelector('.form-error');
  if (!box) {
    box = document.createElement('p');
    box.className = 'form-error';
    box.setAttribute('role', 'alert');
    form.prepend(box);
  }
  const details = (error.details || []).map((item) => item.message).filter(Boolean).join(' ');
  box.textContent = [error.message, details].filter(Boolean).join(' ');
}

async function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.action) return;
  event.preventDefault();
  const action = form.dataset.action;
  const data = formData(form);
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    if (action === 'login') {
      const body = await api('/api/auth/login', { method: 'POST', body: data, auth: false });
      localStorage.setItem('lg_token', body.token);
      state.user = body.utilisateur;
      await refreshCart();
      navigate(STAFF.has(state.user.role) ? '/atelier' : '/');
    } else if (action === 'register') {
      const body = await api('/api/auth/register', { method: 'POST', body: data, auth: false });
      localStorage.setItem('lg_token', body.token);
      state.user = body.utilisateur;
      navigate('/');
    } else if (action === 'ajouter-panier') {
      await api('/api/panier/items', { method: 'POST', body: { ouvrageId: Number(form.dataset.id), quantite: Number(data.quantite || 1) } });
      await refreshCart();
      paintChrome();
      setBanner('Ajouté au panier.');
    } else if (action === 'quantite-panier') {
      await api(`/api/panier/items/${form.dataset.id}`, { method: 'PUT', body: { quantite: Number(data.quantite) } });
      await render();
    } else if (action === 'commander' || action === 'acheter-liste') {
      const adresseLivraison = [data.rue, `${data.codePostal} ${data.ville}`, data.pays].join('\n');
      const payload = { adresseLivraison, modeLivraison: data.modeLivraison, modePaiement: data.modePaiement };
      let commande;
      if (action === 'acheter-liste') {
        const lignes = [...form.querySelectorAll('input[name="item"]:checked')].map((input) => ({
          listeItemId: Number(input.value),
          quantite: Number(form.querySelector(`[name="q-${input.value}"]`).value || 1),
        }));
        if (!lignes.length) throw new ApiError('Cochez au moins un titre à offrir.', 400);
        commande = (await api(`/api/listes/${form.dataset.id}/acheter`, {
          method: 'POST',
          body: { ...payload, lignes, nom: data.nom, email: data.email },
          auth: Boolean(state.user),
        })).commande;
      } else {
        commande = (await api('/api/commandes', { method: 'POST', body: payload })).commande;
      }
      await refreshCart();
      navigate(commande.paiement.url);
    } else if (action === 'avis') {
      await api(`/api/ouvrages/${form.dataset.id}/avis`, { method: 'POST', body: { note: Number(data.note) } });
      setBanner('Avis enregistré.');
      await render({ keepBanner: true });
    } else if (action === 'commentaire') {
      await api(`/api/ouvrages/${form.dataset.id}/commentaires`, { method: 'POST', body: { contenu: data.contenu } });
      setBanner('Commentaire envoyé. Il attend la validation d\'un éditeur.');
      form.reset();
    } else if (action === 'profil') {
      const body = { nom: data.nom, prenom: data.prenom, email: data.email };
      if (data.motDePasse) body.motDePasse = data.motDePasse;
      const result = await api(`/api/users/${state.user.id}`, { method: 'PUT', body });
      state.user = result.utilisateur;
      setBanner('Profil mis à jour.');
      paintChrome();
    } else if (action === 'creer-liste') {
      await api('/api/listes', {
        method: 'POST',
        body: { nom: data.nom, items: [{ ouvrageId: Number(data.ouvrageId), quantiteSouhaitee: Number(data.quantiteSouhaitee) }] },
      });
      setBanner('Liste créée. Le code est prêt à être partagé.');
      await render({ keepBanner: true });
    } else if (action === 'ouvrir-code') {
      navigate(`/listes/${encodeURIComponent(data.code.trim())}`);
    } else if (action === 'sauver-livre') {
      const payload = {
        titre: data.titre,
        auteur: data.auteur,
        isbn: data.isbn,
        description: data.description,
        prix: Number(data.prix),
        stock: Number(data.stock),
        categorieId: Number(data.categorieId),
      };
      if (data.id) await api(`/api/ouvrages/${data.id}`, { method: 'PUT', body: payload });
      else await api('/api/ouvrages', { method: 'POST', body: payload });
      setBanner('Catalogue mis à jour.');
      await render({ keepBanner: true });
    } else if (action === 'sauver-categorie') {
      await api('/api/categories', { method: 'POST', body: { nom: data.nom, description: data.description } });
      state.categories = [];
      setBanner('Catégorie ajoutée.');
      await render({ keepBanner: true });
    } else if (action === 'statut-commande') {
      await api(`/api/commandes/${form.dataset.id}/status`, { method: 'PUT', body: { statut: data.statut } });
      setBanner('Statut de commande mis à jour.');
      await render({ keepBanner: true });
    }
  } catch (error) {
    showFormError(form, error);
  } finally {
    if (button) button.disabled = false;
  }
}

async function onClick(event) {
  const link = event.target.closest('a');
  if (link && link.href) {
    const url = new URL(link.href, location.origin);
    const sameDocumentHash = url.pathname === location.pathname && url.search === location.search && url.hash;
    if (!sameDocumentHash && url.origin === location.origin && !link.hasAttribute('download') && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !url.pathname.startsWith('/api/')) {
      event.preventDefault();
      navigate(url.pathname + url.search);
      document.querySelector('#nav')?.classList.remove('open');
      return;
    }
  }
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === 'logout') {
      await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      localStorage.removeItem('lg_token');
      state.user = null;
      state.cartCount = 0;
      navigate('/');
    } else if (action === 'retirer-panier') {
      await api(`/api/panier/items/${button.dataset.id}`, { method: 'DELETE' });
      await render();
    } else if (action === 'annuler') {
      await api(`/api/commandes/${button.dataset.id}/annuler`, { method: 'POST', body: {} });
      setBanner('Commande annulée.');
      await render({ keepBanner: true });
    } else if (action === 'simuler') {
      button.disabled = true;
      const result = await api(`/api/paiements/${button.dataset.reference}/simuler`, {
        method: 'POST',
        body: { resultat: button.dataset.resultat },
        auth: false,
      });
      setBanner(result.paiement.statut === 'reussi' ? 'Paiement simulé accepté. Le stock a été mis à jour.' : 'Paiement simulé refusé. Le stock n\'a pas bougé.', result.paiement.statut === 'reussi' ? 'ok' : 'error');
      await refreshCart();
      await render({ keepBanner: true });
    } else if (action === 'decider') {
      await api(`/api/commentaires/${button.dataset.id}/valider`, { method: 'PUT', body: { decision: button.dataset.decision } });
      setBanner(button.dataset.decision === 'valider' ? 'Commentaire publié.' : 'Commentaire rejeté.');
      await render({ keepBanner: true });
    } else if (action === 'suspendre') {
      await api(`/api/users/${button.dataset.id}`, { method: 'PUT', body: { actif: button.dataset.actif === '1' } });
      setBanner('Compte mis à jour.');
      await render({ keepBanner: true });
    } else if (action === 'choisir-livre') {
      const book = JSON.parse(button.dataset.livre);
      const form = document.querySelector('#forme-livre');
      form.elements.id.value = book.id;
      form.elements.titre.value = book.titre;
      form.elements.auteur.value = book.auteur;
      form.elements.isbn.value = book.isbn;
      form.elements.description.value = book.description || '';
      form.elements.prix.value = book.prix;
      form.elements.stock.value = book.stock;
      form.elements.categorieId.value = book.categorie.id;
      form.scrollIntoView();
    } else if (action === 'nouveau-livre') {
      document.querySelector('#forme-livre').reset();
    }
  } catch (error) {
    setBanner(error.message, 'error');
  }
}

async function render(options = {}) {
  if (!options.keepBanner) setBanner('');
  paintChrome();
  const path = location.pathname;
  try {
    if (path === '/') await viewHome();
    else if (/^\/ouvrages\/\d+$/.test(path)) await viewDetail(path.split('/')[2]);
    else if (path === '/connexion') viewLogin();
    else if (path === '/inscription') viewRegister();
    else if (path === '/panier') await viewCart();
    else if (path === '/commande') viewCheckout();
    else if (path === '/compte') await viewAccount();
    else if (/^\/commandes\/\d+$/.test(path)) await viewOrder(path.split('/')[2]);
    else if (path === '/listes') await viewLists();
    else if (/^\/listes\/[^/]+$/.test(path)) await viewGift(decodeURIComponent(path.split('/')[2]));
    else if (path === '/atelier') await viewAtelier();
    else if (/^\/paiement\/sim_[A-Za-z0-9_]+$/.test(path)) await viewPayment(path.split('/')[2]);
    else {
      main().innerHTML = `<section class="sheet narrow"><h1>Page introuvable.</h1><p>Ce chemin ne mène à aucun rayon.</p><p><a class="button" href="/">Retour au catalogue</a></p></section>`;
    }
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      navigate('/connexion');
      return;
    }
    failure(error);
  }
  paintChrome();
}

document.querySelector('#menu').addEventListener('click', () => {
  const nav = document.querySelector('#nav');
  const open = nav.classList.toggle('open');
  document.querySelector('#menu').setAttribute('aria-expanded', String(open));
});
document.querySelector('#recherche').addEventListener('submit', (event) => {
  event.preventDefault();
  const texte = new FormData(event.target).get('texte');
  navigate(texte ? `/?texte=${encodeURIComponent(texte)}` : '/');
});
document.addEventListener('submit', onSubmit);
document.addEventListener('click', onClick);
window.addEventListener('popstate', render);
window.addEventListener('online', () => setBanner('Connexion retrouvée.', 'ok'));
window.addEventListener('offline', () => setBanner('Vous êtes hors ligne. Le catalogue en direct attend le réseau.', 'error'));

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary install';
  button.textContent = 'Installer';
  button.addEventListener('click', async () => {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    button.remove();
    deferredPrompt = null;
  });
  document.querySelector('.header-bar').append(button);
});

const token = localStorage.getItem('lg_token');
if (token) {
  try {
    state.user = (await api('/api/users/me')).utilisateur;
    await refreshCart();
  } catch {
    localStorage.removeItem('lg_token');
  }
}
try {
  state.categories = (await api('/api/categories')).categories;
} catch {
  state.categories = [];
}
render();
