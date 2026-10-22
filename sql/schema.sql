-- livresgourmands.net — schéma relationnel (MySQL / MariaDB)
-- Étape 02. Réexécutable : recrée les tables.
-- Aucune donnée bancaire (RG6) : payments ne conserve qu'une référence prestataire.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS commande_items;
DROP TABLE IF EXISTS commandes;
DROP TABLE IF EXISTS liste_items;
DROP TABLE IF EXISTS listes_cadeaux;
DROP TABLE IF EXISTS panier_items;
DROP TABLE IF EXISTS paniers;
DROP TABLE IF EXISTS avis;
DROP TABLE IF EXISTS commentaires;
DROP TABLE IF EXISTS ouvrages;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('client', 'editeur', 'gestionnaire', 'administrateur') NOT NULL DEFAULT 'client',
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(120) NOT NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_categories_nom (nom)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ouvrages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titre VARCHAR(255) NOT NULL,
  auteur VARCHAR(255) NOT NULL,
  isbn VARCHAR(20) NOT NULL,
  description TEXT NULL,
  prix DECIMAL(10, 2) NOT NULL,
  stock INT NOT NULL DEFAULT 0,
  popularite INT NOT NULL DEFAULT 0,
  categorie_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ouvrages_isbn (isbn),
  KEY idx_ouvrages_categorie (categorie_id),
  KEY idx_ouvrages_stock (stock),
  KEY idx_ouvrages_popularite (popularite),
  CONSTRAINT fk_ouvrages_categorie FOREIGN KEY (categorie_id) REFERENCES categories (id),
  CONSTRAINT chk_ouvrages_prix CHECK (prix >= 0),
  CONSTRAINT chk_ouvrages_stock CHECK (stock >= 0),
  CONSTRAINT chk_ouvrages_popularite CHECK (popularite >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE paniers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_paniers_client_actif (client_id, actif),
  CONSTRAINT fk_paniers_client FOREIGN KEY (client_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE panier_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  panier_id INT NOT NULL,
  ouvrage_id INT NOT NULL,
  quantite INT NOT NULL,
  prix_unitaire DECIMAL(10, 2) NOT NULL,
  UNIQUE KEY uq_panier_ouvrage (panier_id, ouvrage_id),
  KEY idx_panier_items_ouvrage (ouvrage_id),
  CONSTRAINT fk_panier_items_panier FOREIGN KEY (panier_id) REFERENCES paniers (id) ON DELETE CASCADE,
  CONSTRAINT fk_panier_items_ouvrage FOREIGN KEY (ouvrage_id) REFERENCES ouvrages (id),
  CONSTRAINT chk_panier_quantite CHECK (quantite > 0),
  CONSTRAINT chk_panier_prix CHECK (prix_unitaire >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE listes_cadeaux (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(200) NOT NULL,
  proprietaire_id INT NOT NULL,
  code_partage VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_listes_code (code_partage),
  KEY idx_listes_proprietaire (proprietaire_id),
  CONSTRAINT fk_listes_proprietaire FOREIGN KEY (proprietaire_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE liste_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  liste_id INT NOT NULL,
  ouvrage_id INT NOT NULL,
  quantite_souhaitee INT NOT NULL,
  quantite_achetee INT NOT NULL DEFAULT 0,
  UNIQUE KEY uq_liste_ouvrage (liste_id, ouvrage_id),
  KEY idx_liste_items_ouvrage (ouvrage_id),
  CONSTRAINT fk_liste_items_liste FOREIGN KEY (liste_id) REFERENCES listes_cadeaux (id) ON DELETE CASCADE,
  CONSTRAINT fk_liste_items_ouvrage FOREIGN KEY (ouvrage_id) REFERENCES ouvrages (id),
  CONSTRAINT chk_liste_souhaitee CHECK (quantite_souhaitee > 0),
  CONSTRAINT chk_liste_achetee CHECK (quantite_achetee >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE commandes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NULL,
  liste_cadeaux_id INT NULL,
  acheteur_nom VARCHAR(200) NOT NULL,
  acheteur_email VARCHAR(255) NOT NULL,
  date_commande DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total DECIMAL(10, 2) NOT NULL,
  statut ENUM(
    'en_attente_paiement',
    'payee',
    'en_preparation',
    'expediee',
    'livree',
    'annulee'
  ) NOT NULL DEFAULT 'en_attente_paiement',
  adresse_livraison TEXT NOT NULL,
  mode_livraison ENUM('standard', 'express', 'relais') NOT NULL,
  mode_paiement ENUM('carte_simulee', 'paypal_simule') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_commandes_client (client_id),
  KEY idx_commandes_statut (statut),
  KEY idx_commandes_date (date_commande),
  KEY idx_commandes_liste (liste_cadeaux_id),
  CONSTRAINT fk_commandes_client FOREIGN KEY (client_id) REFERENCES users (id),
  CONSTRAINT fk_commandes_liste FOREIGN KEY (liste_cadeaux_id) REFERENCES listes_cadeaux (id),
  CONSTRAINT chk_commandes_total CHECK (total >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE commande_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  commande_id INT NOT NULL,
  ouvrage_id INT NOT NULL,
  quantite INT NOT NULL,
  prix_unitaire DECIMAL(10, 2) NOT NULL,
  liste_item_id INT NULL,
  KEY idx_commande_items_commande (commande_id),
  KEY idx_commande_items_ouvrage (ouvrage_id),
  CONSTRAINT fk_commande_items_commande FOREIGN KEY (commande_id) REFERENCES commandes (id) ON DELETE CASCADE,
  CONSTRAINT fk_commande_items_ouvrage FOREIGN KEY (ouvrage_id) REFERENCES ouvrages (id),
  CONSTRAINT fk_commande_items_liste_item FOREIGN KEY (liste_item_id) REFERENCES liste_items (id),
  CONSTRAINT chk_commande_quantite CHECK (quantite > 0),
  CONSTRAINT chk_commande_prix CHECK (prix_unitaire >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE avis (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  ouvrage_id INT NOT NULL,
  note INT NOT NULL,
  date_avis DATE NOT NULL,
  UNIQUE KEY uq_avis_client_ouvrage (client_id, ouvrage_id),
  KEY idx_avis_ouvrage (ouvrage_id),
  CONSTRAINT fk_avis_client FOREIGN KEY (client_id) REFERENCES users (id),
  CONSTRAINT fk_avis_ouvrage FOREIGN KEY (ouvrage_id) REFERENCES ouvrages (id),
  CONSTRAINT chk_avis_note CHECK (note BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE commentaires (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  ouvrage_id INT NOT NULL,
  contenu TEXT NOT NULL,
  statut ENUM('en_attente', 'valide', 'rejete') NOT NULL DEFAULT 'en_attente',
  date_soumission DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  date_validation DATETIME NULL,
  valide_par INT NULL,
  KEY idx_commentaires_ouvrage_statut (ouvrage_id, statut),
  KEY idx_commentaires_client (client_id),
  CONSTRAINT fk_commentaires_client FOREIGN KEY (client_id) REFERENCES users (id),
  CONSTRAINT fk_commentaires_ouvrage FOREIGN KEY (ouvrage_id) REFERENCES ouvrages (id),
  CONSTRAINT fk_commentaires_valideur FOREIGN KEY (valide_par) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  commande_id INT NOT NULL,
  provider VARCHAR(40) NOT NULL,
  provider_payment_id VARCHAR(80) NOT NULL,
  statut ENUM('initie', 'reussi', 'echoue', 'annule') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_reference (provider_payment_id),
  KEY idx_payments_commande (commande_id),
  KEY idx_payments_statut (statut),
  CONSTRAINT fk_payments_commande FOREIGN KEY (commande_id) REFERENCES commandes (id),
  CONSTRAINT chk_payments_amount CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
