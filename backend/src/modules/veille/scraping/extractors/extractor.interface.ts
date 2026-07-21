import { Entreprise } from '@prisma/client';

/**
 * Résultat brut extrait d'une source, avant normalisation/dédoublonnage.
 * Tous les champs sont optionnels sauf title/source_url : chaque extracteur
 * remonte ce qu'il a pu trouver, la normalisation comble les trous.
 */
export interface RawConsultation {
  external_id?: string | null;
  source_url: string;
  title: string;
  description?: string | null;
  categorie?: string | null;
  secteur?: string | null;
  ville?: string | null;
  budget_estimatif?: number | null;
  devise?: string | null;
  maitre_ouvrage?: string | null;
  date_publication?: Date | null;
  date_limite?: Date | null;
  keywords?: string[];
  raw_data?: Record<string, any>;
}

export interface ExtractionResult {
  items: RawConsultation[];
  /** true si l'extracteur a positivement identifié un flux exploitable */
  matched: boolean;
  /** message d'erreur éventuel (n'empêche pas un résultat partiel) */
  error?: string;
}

/**
 * Contrat commun à tous les extracteurs génériques (JSON-LD, RSS, sitemap,
 * heuristiques HTML, sélecteurs configurés) et aux plugins spécifiques par
 * site. Aucune implémentation ne doit dépendre d'une IA/API payante.
 */
export interface Extractor {
  readonly name: string;
  /** Tente d'extraire les annonces pour cette entreprise. Ne doit jamais
   * lever d'exception "non gérée" — retourne matched:false + error en cas
   * d'échec pour permettre au pipeline de tenter l'extracteur suivant. */
  extract(entreprise: Entreprise): Promise<ExtractionResult>;
}
