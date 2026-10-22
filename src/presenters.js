export function presentUser(row) {
  return {
    id: row.id,
    nom: row.nom,
    prenom: row.prenom,
    email: row.email,
    role: row.role,
    actif: Boolean(row.actif),
    createdAt: row.created_at,
  };
}

export function nomAffiche(prenom, nom) {
  const initiale = nom ? `${nom.slice(0, 1)}.` : '';
  return [prenom, initiale].filter(Boolean).join(' ');
}

export function presentOuvrage(row) {
  return {
    id: row.id,
    titre: row.titre,
    auteur: row.auteur,
    isbn: row.isbn,
    description: row.description,
    prix: row.prix,
    stock: Number(row.stock),
    popularite: Number(row.popularite),
    categorie: {
      id: row.categorie_id,
      nom: row.categorie_nom ?? undefined,
    },
  };
}

export function presentCategorie(row) {
  return {
    id: row.id,
    nom: row.nom,
    description: row.description,
  };
}
