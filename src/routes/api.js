import { Router } from 'express';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { interdireDonneesBancaires, validate } from '../middleware/validate.js';
import * as rules from '../validators.js';
import * as auth from '../controllers/authController.js';
import * as users from '../controllers/userController.js';
import * as catalogue from '../controllers/catalogueController.js';
import * as commerce from '../controllers/commerceController.js';

const router = Router();
const staffCatalogue = requireRole('editeur', 'gestionnaire', 'administrateur');
const client = requireRole('client');

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'livresgourmands' });
});

router.post('/auth/register', validate(rules.registerRules), auth.register);
router.post('/auth/login', validate(rules.loginRules), auth.login);
router.post('/auth/logout', requireAuth, auth.logout);

router.get('/users/me', requireAuth, users.me);
router.get('/users', requireAuth, requireRole('administrateur'), users.list);
router.put('/users/:id', requireAuth, validate(rules.updateUserRules), users.update);

router.get('/categories', catalogue.listCategories);
router.post('/categories', requireAuth, staffCatalogue, validate(rules.categorieRules), catalogue.createCategorie);
router.put('/categories/:id', requireAuth, staffCatalogue, validate([...rules.categorieIdRules, ...rules.categorieRules]), catalogue.updateCategorie);
router.delete('/categories/:id', requireAuth, staffCatalogue, validate(rules.categorieIdRules), catalogue.deleteCategorie);

router.get('/ouvrages', optionalAuth, validate(rules.listOuvrageRules), catalogue.listOuvrages);
router.get('/ouvrages/:id', optionalAuth, validate(rules.idRules), catalogue.getOuvrage);
router.post('/ouvrages', requireAuth, staffCatalogue, validate(rules.ouvrageRules), catalogue.createOuvrage);
router.put('/ouvrages/:id', requireAuth, staffCatalogue, validate([...rules.idRules, ...rules.ouvrageRules]), catalogue.updateOuvrage);
router.delete('/ouvrages/:id', requireAuth, staffCatalogue, validate(rules.idRules), catalogue.deleteOuvrage);

router.post('/ouvrages/:id/avis', requireAuth, client, validate(rules.avisRules), commerce.ajouterAvis);
router.post('/ouvrages/:id/commentaires', requireAuth, client, validate(rules.commentaireRules), commerce.ajouterCommentaire);

router.get('/commentaires', requireAuth, requireRole('editeur', 'administrateur'), commerce.listerCommentaires);
router.put('/commentaires/:id/valider', requireAuth, requireRole('editeur', 'administrateur'), validate(rules.decisionCommentaireRules), commerce.deciderCommentaire);

router.get('/panier', requireAuth, client, commerce.getPanier);
router.post('/panier/items', requireAuth, client, validate(rules.panierItemRules), commerce.addPanierItem);
router.put('/panier/items/:id', requireAuth, client, validate(rules.quantiteRules), commerce.updatePanierItem);
router.delete('/panier/items/:id', requireAuth, client, validate(rules.idRules), commerce.deletePanierItem);
router.delete('/panier', requireAuth, client, commerce.clearPanier);

router.post('/commandes', requireAuth, client, interdireDonneesBancaires, validate(rules.commandeRules), commerce.createCommande);
router.get('/commandes', requireAuth, commerce.listCommandes);
router.get('/commandes/:id', requireAuth, validate(rules.idRules), commerce.getCommande);
router.put('/commandes/:id/status', requireAuth, requireRole('gestionnaire', 'administrateur'), validate(rules.statutCommandeRules), commerce.updateCommandeStatut);
router.post('/commandes/:id/annuler', requireAuth, validate(rules.idRules), commerce.annulerCommande);
router.post('/commandes/:id/paiement', requireAuth, validate(rules.idRules), commerce.relancerPaiement);

router.get('/listes', requireAuth, client, commerce.mesListes);
router.post('/listes', requireAuth, client, validate(rules.listeRules), commerce.createListe);
router.get('/listes/:code', commerce.getListe);
router.post('/listes/:id/items', requireAuth, client, validate(rules.listeItemRules), commerce.addListeItem);
router.delete('/listes/:id/items/:itemId', requireAuth, client, commerce.deleteListeItem);
router.post('/listes/:idOuCode/acheter', optionalAuth, interdireDonneesBancaires, validate(rules.achatListeRules), commerce.acheterListe);

router.get('/paiements/me', requireAuth, client, commerce.mesPaiements);
router.get('/paiements', requireAuth, requireRole('gestionnaire', 'administrateur'), commerce.tousPaiements);
router.get('/paiements/:reference', commerce.getPaiement);
router.post('/paiements/:reference/simuler', interdireDonneesBancaires, validate(rules.simulationRules), commerce.simulerPaiement);

router.get('/ventes', requireAuth, requireRole('gestionnaire', 'administrateur'), validate(rules.ventesRules), commerce.ventes);

export default router;
