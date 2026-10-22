export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

export function euro(value) {
  const number = Number(value);
  if (Number.isNaN(number)) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(number);
}

export const STATUTS = {
  en_attente_paiement: 'En attente de paiement',
  payee: 'Payée',
  en_preparation: 'En préparation',
  expediee: 'Expédiée',
  livree: 'Livrée',
  annulee: 'Annulée',
};

export const LIVRAISON = {
  standard: 'Standard — 4 à 6 jours',
  express: 'Express — le lendemain',
  relais: 'Point relais — 3 à 5 jours',
};

export const PAIEMENT = {
  carte_simulee: 'Carte (simulation)',
  paypal_simule: 'PayPal (simulation)',
};

export function statutLabel(statut) {
  return STATUTS[statut] || statut;
}

export function etoiles(note) {
  const n = Number(note) || 0;
  return `${'●'.repeat(n)}${'○'.repeat(Math.max(0, 5 - n))}`;
}
