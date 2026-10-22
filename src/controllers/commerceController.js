import { asyncHandler } from '../asyncHandler.js';
import * as panierService from '../services/panierService.js';
import * as commandeService from '../services/commandeService.js';
import * as listeService from '../services/listeService.js';
import * as avisService from '../services/avisService.js';

export const getPanier = asyncHandler(async (req, res) => {
  res.json({ panier: await panierService.obtenirPanier(req.user.id) });
});

export const addPanierItem = asyncHandler(async (req, res) => {
  const panier = await panierService.ajouterItem(req.user.id, req.body);
  res.status(201).json({ panier });
});

export const updatePanierItem = asyncHandler(async (req, res) => {
  res.json({ panier: await panierService.modifierQuantite(req.user.id, req.params.id, req.body.quantite) });
});

export const deletePanierItem = asyncHandler(async (req, res) => {
  res.json({ panier: await panierService.retirerItem(req.user.id, req.params.id) });
});

export const clearPanier = asyncHandler(async (req, res) => {
  res.json({ panier: await panierService.viderPanier(req.user.id) });
});

export const createCommande = asyncHandler(async (req, res) => {
  const commande = await commandeService.creerDepuisPanier(req.user.id, req.body);
  res.status(201).json({ commande });
});

export const listCommandes = asyncHandler(async (req, res) => {
  res.json({ commandes: await commandeService.lister(req.user) });
});

export const getCommande = asyncHandler(async (req, res) => {
  res.json({ commande: await commandeService.obtenir(req.user, req.params.id) });
});

export const updateCommandeStatut = asyncHandler(async (req, res) => {
  res.json({ commande: await commandeService.changerStatut(req.params.id, req.body.statut) });
});

export const annulerCommande = asyncHandler(async (req, res) => {
  res.json({ commande: await commandeService.annuler(req.user, req.params.id) });
});

export const relancerPaiement = asyncHandler(async (req, res) => {
  res.status(201).json({ commande: await commandeService.nouveauPaiement(req.user, req.params.id) });
});

export const simulerPaiement = asyncHandler(async (req, res) => {
  res.json(await commandeService.simulerPaiement(req.params.reference, req.body.resultat));
});

export const getPaiement = asyncHandler(async (req, res) => {
  res.json(await commandeService.consulterPaiement(req.params.reference));
});

export const mesPaiements = asyncHandler(async (req, res) => {
  res.json({ paiements: await commandeService.historiquePaiements(req.user) });
});

export const tousPaiements = asyncHandler(async (req, res) => {
  res.json({ paiements: await commandeService.historiquePaiements(req.user) });
});

export const ventes = asyncHandler(async (req, res) => {
  res.json(await commandeService.ventes({
    du: req.query.du || null,
    au: req.query.au || null,
    categorieId: req.query.categorie || null,
  }));
});

export const createListe = asyncHandler(async (req, res) => {
  const liste = await listeService.creer(req.user.id, req.body);
  res.status(201).json({ liste });
});

export const mesListes = asyncHandler(async (req, res) => {
  res.json({ listes: await listeService.mesListes(req.user.id) });
});

export const getListe = asyncHandler(async (req, res) => {
  res.json({ liste: await listeService.parCode(req.params.code) });
});

export const addListeItem = asyncHandler(async (req, res) => {
  const liste = await listeService.ajouterItem(req.user.id, req.params.id, req.body);
  res.status(201).json({ liste });
});

export const deleteListeItem = asyncHandler(async (req, res) => {
  res.json({ liste: await listeService.retirerItem(req.user.id, req.params.id, req.params.itemId) });
});

export const acheterListe = asyncHandler(async (req, res) => {
  const liste = await listeService.parIdOuCode(req.params.idOuCode);
  const commande = await commandeService.creerDepuisListe(req.user, liste, req.body.lignes, req.body);
  res.status(201).json({ commande });
});

export const ajouterAvis = asyncHandler(async (req, res) => {
  const avis = await avisService.ajouterAvis(req.user.id, req.params.id, req.body.note);
  res.status(201).json({ avis });
});

export const ajouterCommentaire = asyncHandler(async (req, res) => {
  const commentaire = await avisService.ajouterCommentaire(req.user.id, req.params.id, req.body.contenu);
  res.status(201).json({ commentaire });
});

export const listerCommentaires = asyncHandler(async (req, res) => {
  res.json({ commentaires: await avisService.listerCommentaires(req.query.statut || 'en_attente') });
});

export const deciderCommentaire = asyncHandler(async (req, res) => {
  res.json({ commentaire: await avisService.deciderCommentaire(req.user.id, req.params.id, req.body.decision) });
});
