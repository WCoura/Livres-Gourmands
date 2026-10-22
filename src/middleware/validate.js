import { validationResult } from 'express-validator';
import { HttpError } from '../errors.js';

const CHAMPS_BANCAIRES = new Set([
  'numerocarte',
  'numcarte',
  'cardnumber',
  'cvv',
  'cvc',
  'pan',
  'iban',
  'securitycode',
  'cryptogramme',
]);

export function interdireDonneesBancaires(req, res, next) {
  const keys = Object.keys(req.body || {}).map((key) => key.toLowerCase().replace(/[_\s-]/g, ''));
  if (keys.some((key) => CHAMPS_BANCAIRES.has(key))) {
    next(new HttpError(400, 'Aucune donnée bancaire ne doit être transmise (RG6).'));
    return;
  }
  next();
}

export function validate(rules) {
  return [
    ...rules,
    (req, res, next) => {
      const result = validationResult(req);
      if (result.isEmpty()) {
        next();
        return;
      }
      next(new HttpError(400, 'Données invalides.', result.array().map((error) => ({
        champ: error.path,
        message: error.msg,
      }))));
    },
  ];
}
