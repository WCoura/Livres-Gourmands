import { asyncHandler } from '../asyncHandler.js';
import * as authService from '../services/authService.js';

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json(result);
});

export const login = asyncHandler(async (req, res) => {
  res.json(await authService.login(req.body));
});

export const logout = asyncHandler(async (req, res) => {
  res.status(204).end();
});
