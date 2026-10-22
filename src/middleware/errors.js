import { HttpError } from '../errors.js';

export function notFound(req, res) {
  res.status(404).json({ erreur: 'Ressource introuvable.', details: [] });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err instanceof SyntaxError && err.status === 400) {
    res.status(400).json({ erreur: 'JSON invalide.', details: [] });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ erreur: err.message, details: err.details || [] });
    return;
  }
  if (err?.code === 'ER_DUP_ENTRY') {
    res.status(409).json({ erreur: 'Cette valeur existe déjà.', details: [] });
    return;
  }
  console.error(err);
  res.status(500).json({ erreur: 'Erreur interne du serveur.', details: [] });
}
