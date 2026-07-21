import { Extractor } from '../extractors/extractor.interface';

/**
 * Un "plugin" est un extracteur spécifique à un site (Entreprise.plugin_key),
 * utilisé quand ni JSON-LD, ni RSS, ni sitemap, ni sélecteurs configurés ne
 * suffisent (ex: pagination JS, endpoint interne, format propriétaire).
 * Ajouter un plugin = ajouter un fichier + une ligne dans le registre :
 * aucune modification du cœur du système (orchestrateur, contrôleurs, etc.).
 */
export interface ScraperPlugin extends Extractor {
  /** Clé stable référencée par Entreprise.plugin_key */
  readonly key: string;
}
