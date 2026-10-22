import { asyncHandler } from '../asyncHandler.js';
import * as catalogue from '../services/catalogueService.js';

export const listCategories = asyncHandler(async (req, res) => {
  res.json({ categories: await catalogue.listCategories() });
});

export const createCategorie = asyncHandler(async (req, res) => {
  res.status(201).json({ categorie: await catalogue.createCategorie(req.body) });
});

export const updateCategorie = asyncHandler(async (req, res) => {
  res.json({ categorie: await catalogue.updateCategorie(req.params.id, req.body) });
});

export const deleteCategorie = asyncHandler(async (req, res) => {
  await catalogue.deleteCategorie(req.params.id);
  res.status(204).end();
});

export const listOuvrages = asyncHandler(async (req, res) => {
  const inclure = req.query.inclureRupture === '1' || req.query.inclureRupture === 'true';
  const result = await catalogue.listOuvrages({
    texte: req.query.texte?.trim() || '',
    categorie: req.query.categorie,
    populariteMin: req.query.populariteMin,
    page: req.query.page || 1,
    limite: req.query.limite || 12,
    inclureRupture: inclure,
    user: req.user,
  });
  res.json(result);
});

export const getOuvrage = asyncHandler(async (req, res) => {
  res.json(await catalogue.getOuvrage(req.params.id, req.user));
});

export const createOuvrage = asyncHandler(async (req, res) => {
  const result = await catalogue.createOuvrage(req.body);
  res.status(201).json(result);
});

export const updateOuvrage = asyncHandler(async (req, res) => {
  res.json(await catalogue.updateOuvrage(req.params.id, req.body));
});

export const deleteOuvrage = asyncHandler(async (req, res) => {
  await catalogue.deleteOuvrage(req.params.id);
  res.status(204).end();
});
