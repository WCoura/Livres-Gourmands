import { body, param, query } from 'express-validator';

const email = body('email').trim().isEmail().withMessage('Courriel invalide.');
const motDePasse = body('motDePasse')
  .isString()
  .isLength({ min: 8, max: 80 })
  .withMessage('Le mot de passe doit contenir au moins 8 caractères.')
  .matches(/[A-Za-zÀ-ÿ]/)
  .withMessage('Le mot de passe doit contenir une lettre.')
  .matches(/[0-9]/)
  .withMessage('Le mot de passe doit contenir un chiffre.');

export const registerRules = [
  body('nom').trim().isLength({ min: 1, max: 100 }).withMessage('Le nom est requis.'),
  body('prenom').trim().isLength({ min: 1, max: 100 }).withMessage('Le prénom est requis.'),
  email,
  motDePasse,
];

export const loginRules = [
  body('email').trim().notEmpty().withMessage('Le courriel est requis.'),
  body('motDePasse').isString().notEmpty().withMessage('Le mot de passe est requis.'),
];

export const updateUserRules = [
  param('id').isInt({ min: 1 }).withMessage('Identifiant invalide.').toInt(),
  body('nom').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Nom invalide.'),
  body('prenom').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Prénom invalide.'),
  body('email').optional().trim().isEmail().withMessage('Courriel invalide.'),
  body('motDePasse').optional(),
  body('role').optional().isIn(['client', 'editeur', 'gestionnaire', 'administrateur']).withMessage('Rôle invalide.'),
  body('actif').optional().isBoolean().withMessage('Le statut actif doit être un booléen.').toBoolean(),
];

export const categorieRules = [
  body('nom').trim().isLength({ min: 2, max: 120 }).withMessage('Le nom de catégorie est requis.'),
  body('description').optional({ nullable: true }).isString().isLength({ max: 2000 }),
];

export const categorieIdRules = [
  param('id').isInt({ min: 1 }).withMessage('Identifiant invalide.').toInt(),
];

export const ouvrageRules = [
  body('titre').trim().isLength({ min: 1, max: 255 }).withMessage('Le titre est requis.'),
  body('auteur').trim().isLength({ min: 1, max: 255 }).withMessage('L\'auteur est requis.'),
  body('isbn').trim().matches(/^[0-9-]{10,20}$/).withMessage('ISBN invalide.'),
  body('description').optional({ nullable: true }).isString().isLength({ max: 5000 }),
  body('prix').isFloat({ min: 0, max: 9999 }).withMessage('Prix invalide.').toFloat(),
  body('stock').isInt({ min: 0, max: 100000 }).withMessage('Stock invalide.').toInt(),
  body('categorieId').isInt({ min: 1 }).withMessage('Catégorie requise.').toInt(),
];

export const listOuvrageRules = [
  query('texte').optional().isString().isLength({ max: 120 }),
  query('categorie').optional().isInt({ min: 1 }).toInt(),
  query('populariteMin').optional().isInt({ min: 0 }).toInt(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limite').optional().isInt({ min: 1, max: 48 }).toInt(),
  query('inclureRupture').optional().isIn(['0', '1', 'true', 'false']),
];

export const idRules = [
  param('id').isInt({ min: 1 }).withMessage('Identifiant invalide.').toInt(),
];

export const panierItemRules = [
  body('ouvrageId').isInt({ min: 1 }).withMessage('Ouvrage requis.').toInt(),
  body('quantite').isInt({ min: 1, max: 20 }).withMessage('Quantité invalide.').toInt(),
];

export const quantiteRules = [
  param('id').isInt({ min: 1 }).toInt(),
  body('quantite').isInt({ min: 1, max: 20 }).withMessage('Quantité invalide.').toInt(),
];

const adresse = body('adresseLivraison')
  .trim()
  .isLength({ min: 10, max: 500 })
  .withMessage('L\'adresse de livraison est requise.');
const modeLivraison = body('modeLivraison')
  .isIn(['standard', 'express', 'relais'])
  .withMessage('Mode de livraison invalide.');
const modePaiement = body('modePaiement')
  .isIn(['carte_simulee', 'paypal_simule'])
  .withMessage('Mode de paiement invalide.');

export const commandeRules = [adresse, modeLivraison, modePaiement];

export const statutCommandeRules = [
  param('id').isInt({ min: 1 }).toInt(),
  body('statut')
    .isIn(['en_attente_paiement', 'payee', 'en_preparation', 'expediee', 'livree', 'annulee'])
    .withMessage('Statut de commande invalide.'),
];

export const listeRules = [
  body('nom').trim().isLength({ min: 2, max: 200 }).withMessage('Le nom de la liste est requis.'),
  body('items').isArray({ min: 1, max: 30 }).withMessage('Ajoutez au moins un ouvrage.'),
  body('items.*.ouvrageId').isInt({ min: 1 }).withMessage('Ouvrage invalide.').toInt(),
  body('items.*.quantiteSouhaitee').isInt({ min: 1, max: 20 }).withMessage('Quantité souhaitée invalide.').toInt(),
];

export const listeItemRules = [
  param('id').isInt({ min: 1 }).toInt(),
  body('ouvrageId').isInt({ min: 1 }).toInt(),
  body('quantiteSouhaitee').isInt({ min: 1, max: 20 }).toInt(),
];

export const achatListeRules = [
  param('idOuCode').isString().isLength({ min: 1, max: 32 }),
  body('lignes').isArray({ min: 1, max: 30 }).withMessage('Sélectionnez au moins un article.'),
  body('lignes.*.listeItemId').isInt({ min: 1 }).toInt(),
  body('lignes.*.quantite').isInt({ min: 1, max: 20 }).toInt(),
  body('nom').optional().trim().isLength({ min: 2, max: 200 }),
  body('email').optional().trim().isEmail().withMessage('Courriel invalide.'),
  adresse,
  modeLivraison,
  modePaiement,
];

export const avisRules = [
  param('id').isInt({ min: 1 }).toInt(),
  body('note').isInt({ min: 1, max: 5 }).withMessage('La note doit être comprise entre 1 et 5.').toInt(),
];

export const commentaireRules = [
  param('id').isInt({ min: 1 }).toInt(),
  body('contenu').trim().isLength({ min: 4, max: 2000 }).withMessage('Le commentaire est trop court.'),
];

export const decisionCommentaireRules = [
  param('id').isInt({ min: 1 }).toInt(),
  body('decision').isIn(['valider', 'rejeter']).withMessage('Décision invalide.'),
];

export const simulationRules = [
  param('reference').matches(/^sim_[a-z0-9_]+$/i).withMessage('Référence de paiement invalide.'),
  body('resultat').isIn(['reussi', 'echoue']).withMessage('Le résultat doit être reussi ou echoue.'),
];

export const ventesRules = [
  query('du').optional().isISO8601().withMessage('Date de début invalide.'),
  query('au').optional().isISO8601().withMessage('Date de fin invalide.'),
  query('categorie').optional().isInt({ min: 1 }).toInt(),
];
