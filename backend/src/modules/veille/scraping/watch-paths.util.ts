import { Entreprise } from '@prisma/client';
import { resolveUrl } from './http.util';

/**
 * Rubriques types où les entreprises marocaines publient leurs appels
 * d'offres / consultations / avis fournisseurs. Utilisées comme pages à
 * surveiller par défaut quand Entreprise.pages_surveillees est vide — sans
 * que l'admin ait besoin de les saisir manuellement pour chaque entreprise.
 */
export const DEFAULT_WATCH_PATHS = [
  '/appels-offres',
  '/consultations',
  '/procurement',
  '/achats',
  '/suppliers',
  '/fournisseurs',
  '/vendor',
  '/rfq',
  '/rfp',
  '/tenders',
  '/news',
  '/actualites',
  '/projets',
];

/** Mots-clés utilisés par les heuristiques (HTML générique, détection de
 * liens pertinents, sitemap) pour repérer une annonce de consultation. */
export const OPPORTUNITY_KEYWORDS = [
  "appel d'offres",
  'appel d offres',
  "appel a\\s*concurrence",
  'consultation',
  'fournisseur',
  'procurement',
  'tender',
  'marché',
  'rfq',
  'rfp',
  'travaux',
  'construction',
  'maintenance',
  'rénovation',
  'renovation',
  'devis',
  'soumission',
  'avis de',
];

export const OPPORTUNITY_KEYWORDS_REGEX = new RegExp(OPPORTUNITY_KEYWORDS.join('|'), 'i');

/**
 * Construit la liste des pages à parcourir pour une entreprise : la page
 * d'accueil, les pages explicitement déclarées (pages_surveillees), et à
 * défaut les rubriques types ci-dessus résolues sur le site officiel.
 */
export function pagesToScan(entreprise: Entreprise, max = 10): string[] {
  const base = entreprise.site_officiel;
  if (!base) return [];

  const declared = (entreprise.pages_surveillees || [])
    .map((p) => resolveUrl(base, p))
    .filter(Boolean) as string[];

  const candidates = declared.length
    ? declared
    : (DEFAULT_WATCH_PATHS.map((p) => resolveUrl(base, p)).filter(Boolean) as string[]);

  return [...new Set([base, ...candidates])].slice(0, max);
}

/** Repère les liens d'une page dont le texte ou l'URL évoque une
 * consultation/appel d'offres — utilisé en complément des sélecteurs
 * répétitifs par l'extracteur HTML générique. */
export function looksLikeOpportunity(text: string): boolean {
  return OPPORTUNITY_KEYWORDS_REGEX.test(text);
}
