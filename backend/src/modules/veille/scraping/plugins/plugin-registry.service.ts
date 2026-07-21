import { Injectable } from '@nestjs/common';
import { ScraperPlugin } from './plugin.interface';

/**
 * Registre des plugins spécifiques par site. Pour ajouter un nouvel
 * extracteur dédié à un site précis :
 *   1. Créer un fichier dans ce dossier implémentant ScraperPlugin
 *      (voir extractors/*.extractor.ts pour le contrat Extractor).
 *   2. L'ajouter au tableau `plugins` ci-dessous.
 *   3. Renseigner Entreprise.plugin_key avec la même clé et
 *      Entreprise.type = 'PLUGIN' (depuis l'admin ou le seed).
 * Aucune autre partie du système (orchestrateur, contrôleurs, cron) n'a
 * besoin d'être modifiée : le registre est injecté partout où l'on résout
 * un extracteur par plugin_key.
 */
@Injectable()
export class PluginRegistryService {
  // Déposer ici les instances des plugins spécifiques au fur et à mesure
  // qu'ils sont développés, ex: new LesOffresMaPlugin(), new AddohaPlugin()...
  private readonly plugins: ScraperPlugin[] = [];

  private readonly byKey = new Map<string, ScraperPlugin>(this.plugins.map((p) => [p.key, p]));

  get(key: string | null | undefined): ScraperPlugin | undefined {
    if (!key) return undefined;
    return this.byKey.get(key);
  }

  list(): { key: string; name: string }[] {
    return this.plugins.map((p) => ({ key: p.key, name: p.name }));
  }
}
