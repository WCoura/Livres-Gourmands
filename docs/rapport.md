# Rapport — étape 02, Livres Gourmands

## Modèle

Le schéma part de la proposition relationnelle de la séance (users, categories, ouvrages, paniers, commandes, listes, avis, commentaires, payments) et reprend les éléments du diagramme de classes qui portent une règle ou un écran :

- `prenom` sur `users`, parce que le client et l’affichage des avis distinguent la personne ;
- `popularite` sur `ouvrages`, parce que la recherche filtre `populariteMin` ;
- statuts de commande alignés sur le diagramme (`en_attente_paiement`, `payee`, `en_preparation`, `expediee`, `livree`, `annulee`) plutôt que les quatre valeurs indicatives de la séance, pour pouvoir suivre et annuler une commande ;
- `commentaires.statut` à trois valeurs, parce que « valider / rejeter » ne tient pas dans un booléen (en attente et rejeté seraient tous deux faux) ;
- `liste_items.quantite_achetee`, pour qu’un ami ne puisse pas offrir deux fois le même exemplaire ;
- `commandes.client_id` nullable, pour l’acteur Ami qui achète avec un code sans compte. Le nom et le courriel de l’acheteur sont copiés sur la commande.

Les rôles du back-office sont une colonne `users.role`, pas quatre tables. C’est le modèle recommandé par la séance, et le middleware s’en sert directement. Les mots de passe ne sortent jamais de `password_hash` (bcrypt, coût 10).

Le schéma est en troisième forme normale : les prix de ligne sont des instantanés (`prix_unitaire`), pas une copie vivante du catalogue ; l’adresse de livraison est un texte sur la commande, comme proposé, plutôt qu’une table d’adresses non demandée par l’API. Les paiements ne contiennent que `provider` et `provider_payment_id`.

Index : courriel, ISBN, code de partage, stock, popularité, client du panier, statut et date de commande, ouvrage des avis et des commentaires. Ils servent la recherche, l’unicité et le suivi des ventes.

## Règles de gestion

| Règle | Où |
| --- | --- |
| RG1 stock > 0 au catalogue public | `listOuvrages` / `getOuvrage`. Contrainte `CHECK (stock >= 0)`. |
| RG2 panier expiré | `TIMESTAMPDIFF` à la lecture du panier, et `scripts/expire-paniers.js`. |
| RG3 avis après achat | requête sur `commandes` + `commande_items` avant `INSERT`. Unicité `(client_id, ouvrage_id)`. |
| RG4 modération | défaut `en_attente`. `PUT /api/commentaires/:id/valider` réservé à l’éditeur. La fiche publique filtre `valide`. |
| RG5 suspension | `users.actif`. Le login et le middleware JWT relisent le compte. |
| RG6 pas de données bancaires | table `payments` limitée à une référence. Middleware qui rejette `numeroCarte`, `cvv`, `iban`, etc. |
| Stock à la validation | transaction : verrou `FOR UPDATE`, `UPDATE ... WHERE stock >= ?`, puis statut `payee`. Annulation : le stock est rendu si la commande avait déjà été payée. |

La validation des entrées passe par express-validator. Les erreurs HTTP sont centralisées (`erreur`, `details`).

## PWA et authentification

L’API et l’interface sont le même processus Express, pour rester sur la pile demandée (Node, Express, MySQL, JWT, bcrypt) sans second framework. Le jeton est renvoyé au login et à l’inscription. La déconnexion est sans état : le client oublie le jeton. Le service worker ne met pas l’API en cache.

## Limites

- Le paiement ne parle ni à Stripe ni à PayPal. La référence `sim_…` suffit à la démo et au respect de RG6.
- L’expiration des paniers n’est pas un cron système : c’est un script, plus un contrôle à chaque lecture.
- RG3 n’est pas un déclencheur SQL. La base empêche le doublon ; l’API vérifie l’achat, comme demandé (« vérification côté API »).
- Le JWT est stocké dans `localStorage` par la PWA. Un cookie `HttpOnly` serait préférable en production.
- Si `JWT_SECRET` est absent, un secret de développement est utilisé et signalé dans la console. Il ne faut pas déployer ainsi.
