-- Données de démonstration. Mots de passe hashés avec bcrypt (coût 10).
-- Camille123!  Editeur123!  Gestion123!  Admin123!
-- Comptes locaux uniquement.

SET NAMES utf8mb4;

INSERT INTO users (id, nom, prenom, email, password_hash, role, actif) VALUES
  (1, 'Laurent', 'Camille', 'camille.client@livresgourmands.test', '$2b$10$4iFG13bE/bgvWfH7/HAP6.NXYBBdYwrqaiZVGdlyk.wBe6aJywio6', 'client', 1),
  (2, 'Ferreira', 'Louis', 'louis.editeur@livresgourmands.test', '$2b$10$L9a4.x63uXuZkO.NAtHUD.mwNxFAPYpYS.jd7SSwhniutyZ1fZ9fW', 'editeur', 1),
  (3, 'Benali', 'Sara', 'sara.gestion@livresgourmands.test', '$2b$10$663e1jIJLHQTVtH3/rs.Su3hKY.aHeT5SoLv1WSuPIKelVj./iIC.', 'gestionnaire', 1),
  (4, 'Chartrand', 'Noémie', 'noemie.admin@livresgourmands.test', '$2b$10$7yzv1AHN8tDYTvBFhh0O7OzKri0N/WoaKTmYBtJVGIS3G.QGjEk5W', 'administrateur', 1);

INSERT INTO categories (id, nom, description) VALUES
  (1, 'Cuisine du quotidien', 'Plats de la semaine, soupes et tables d''invités.'),
  (2, 'Pâtisserie', 'Pâtes, tartes et desserts à comprendre avant de les enjoliver.'),
  (3, 'Techniques de chef', 'Gestes, fonds et sauces pour gagner en précision.'),
  (4, 'Cuisine du monde', 'Recettes de marchés, avec des produits que l''on trouve ici.'),
  (5, 'Pour débuter', 'Premiers gestes, premiers menus, sans présumer un placard déjà plein.');

INSERT INTO ouvrages (id, titre, auteur, isbn, description, prix, stock, popularite, categorie_id) VALUES
  (1, 'Marmite du dimanche', 'Claire Boileau', '978-2-38011-001-1',
    'Des plats de famille pour le dimanche, avec des quantités pour six et des variantes quand il reste du rôti.',
    24.90, 12, 40, 1),
  (2, 'Quatre feux, une poêle', 'Hugo Marchand', '978-2-38011-002-8',
    'Trente dîners de semaine tenus dans une seule poêle, du marché du mardi au jeudi soir.',
    19.50, 8, 22, 1),
  (3, 'Le beurre et la manière', 'Inès Valmont', '978-2-38011-003-5',
    'Pâtes, crèmes et cuissons expliquées pour qui veut comprendre avant de décorer.',
    32.00, 5, 61, 2),
  (4, 'Tartes sans détour', 'Paul Écuyer', '978-2-38011-004-2',
    'Une tarte par semaine, salée ou sucrée. Épuisé au catalogue public tant que le stock est nul.',
    27.00, 0, 15, 2),
  (5, 'Le geste juste', 'Antoine Serra', '978-2-38011-005-9',
    'Tailles, fonds, liaisons et cuissons : le manuel qu''on garde ouvert sur le plan de travail.',
    45.00, 6, 80, 3),
  (6, 'Sauces de saison', 'Mei Laurent', '978-2-38011-006-6',
    'Des sauces courtes, liées au calendrier des marchés plutôt qu''à une carte figée.',
    29.90, 9, 33, 3),
  (7, 'Marchés d''ailleurs', 'Nadia El Fassi', '978-2-38011-007-3',
    'Recettes ramenées de marchés, avec les produits de substitution quand l''étal local ne suit pas.',
    34.00, 7, 48, 4),
  (8, 'Riz, feu et citron', 'Kenji Morel', '978-2-38011-008-0',
    'Riz sauté, grillades rapides et ce que le citron rattrape en fin de cuisson.',
    26.50, 11, 27, 4),
  (9, 'Premier tablier', 'Lina Costa', '978-2-38011-009-7',
    'Le premier livre pour qui vient d''acheter une poêle : œufs, pâtes, soupes, et comment rater moins souvent.',
    18.00, 20, 55, 5),
  (10, 'Le couteau encore timide', 'Marc Duhamel', '978-2-38011-010-3',
    'Apprendre à couper sans se presser, puis trois menus qui utilisent seulement ces gestes.',
    21.00, 4, 12, 5),
  (11, 'Bouillons clairs', 'Hélène Ortiz', '978-2-38011-011-0',
    'Bouillons, soupes et nouilles pour les soirs où l''on veut un bol plutôt qu''une assiette.',
    23.00, 3, 18, 1),
  (12, 'Festins pour six', 'Sarah Nguyen', '978-2-38011-012-7',
    'Menus d''invités, courses comprises, pour une table de six sans finir la veille à minuit.',
    38.00, 2, 70, 1);

INSERT INTO listes_cadeaux (id, nom, proprietaire_id, code_partage, created_at) VALUES
  (1, 'Table d''hiver', 1, 'TABLE-HIVER', '2026-09-20 09:00:00');

INSERT INTO liste_items (id, liste_id, ouvrage_id, quantite_souhaitee, quantite_achetee) VALUES
  (1, 1, 9, 2, 0),
  (2, 1, 5, 1, 0);

INSERT INTO commandes (
  id, client_id, liste_cadeaux_id, acheteur_nom, acheteur_email, date_commande,
  total, statut, adresse_livraison, mode_livraison, mode_paiement
) VALUES (
  1, 1, NULL, 'Camille Laurent', 'camille.client@livresgourmands.test', '2026-10-01 14:30:00',
  18.00, 'payee', '12 rue des Oliviers\n13001 Marseille\nFrance', 'standard', 'carte_simulee'
);

INSERT INTO commande_items (id, commande_id, ouvrage_id, quantite, prix_unitaire, liste_item_id) VALUES
  (1, 1, 9, 1, 18.00, NULL);

INSERT INTO payments (id, commande_id, provider, provider_payment_id, statut, amount, created_at) VALUES
  (1, 1, 'simulation_carte', 'sim_carte_seed_camille_1', 'reussi', 18.00, '2026-10-01 14:31:00');

INSERT INTO avis (id, client_id, ouvrage_id, note, date_avis) VALUES
  (1, 1, 9, 5, '2026-10-02');

INSERT INTO commentaires (
  id, client_id, ouvrage_id, contenu, statut, date_soumission, date_validation, valide_par
) VALUES
  (1, 1, 9, 'Clair dès la première pâte à crêpes. Les quantités tiennent dans une cuisine étroite.',
    'valide', '2026-10-03 10:00:00', '2026-10-04 11:00:00', 2),
  (2, 1, 5, 'La reliure est belle, et le chapitre sur les fonds bruns est clair.',
    'en_attente', '2026-10-12 15:00:00', NULL, NULL);
