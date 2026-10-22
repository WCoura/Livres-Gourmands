import { asyncHandler } from '../asyncHandler.js';
import * as authService from '../services/authService.js';
import * as userService from '../services/userService.js';
import { HttpError } from '../errors.js';

export const me = asyncHandler(async (req, res) => {
  res.json({ utilisateur: await authService.me(req.user.id) });
});

export const list = asyncHandler(async (req, res) => {
  res.json({ utilisateurs: await userService.list() });
});

export const update = asyncHandler(async (req, res) => {
  if (req.body.motDePasse) {
    const password = String(req.body.motDePasse);
    if (password.length < 8 || !/[A-Za-zÀ-ÿ]/.test(password) || !/[0-9]/.test(password)) {
      throw new HttpError(400, 'Le mot de passe doit contenir au moins 8 caractères, une lettre et un chiffre.');
    }
  }
  const utilisateur = await userService.update(req.user, req.params.id, req.body);
  res.json({ utilisateur });
});
