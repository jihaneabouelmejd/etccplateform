import { Injectable, Logger } from '@nestjs/common';
import { Entreprise, SourceType } from '@prisma/client';
import { ExtractionResult } from './extractor.interface';
import { JsonLdExtractor } from './json-ld.extractor';
import { RssExtractor } from './rss.extractor';
import { SitemapExtractor } from './sitemap.extractor';
import { HtmlGenericExtractor } from './html-generic.extractor';
import { HtmlConfiguredExtractor } from './html-configured.extractor';
import { PluginRegistryService } from '../plugins/plugin-registry.service';

/**
 * Chaîne de résolution automatique (exigence #2/#6 du cahier des charges) :
 * PLUGIN dédié (si plugin_key renseigné) > sélecteurs CSS configurés (si
 * présents) > JSON-LD > RSS/Atom > sitemap > heuristiques HTML génériques.
 * Le premier extracteur qui "matched" gagne. Si aucun n'aboutit, l'appelant
 * (orchestrateur) marque l'entreprise A_CONFIGURER.
 */
@Injectable()
export class ExtractorPipelineService {
  private readonly logger = new Logger(ExtractorPipelineService.name);

  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly jsonLd: JsonLdExtractor,
    private readonly rss: RssExtractor,
    private readonly sitemap: SitemapExtractor,
    private readonly htmlGeneric: HtmlGenericExtractor,
    private readonly htmlConfigured: HtmlConfiguredExtractor,
  ) {}

  async run(entreprise: Entreprise): Promise<{ result: ExtractionResult; usedExtractor: string }> {
    // 1. Plugin spécifique explicitement configuré
    if (entreprise.type === SourceType.PLUGIN && entreprise.plugin_key) {
      const plugin = this.pluginRegistry.get(entreprise.plugin_key);
      if (plugin) {
        const result = await this.safeRun(plugin.name, () => plugin.extract(entreprise));
        if (result.matched) return { result, usedExtractor: plugin.name };
      } else {
        this.logger.warn(`plugin_key "${entreprise.plugin_key}" introuvable dans le registre pour ${entreprise.nom}`);
      }
    }

    // 2. Sélecteurs CSS configurés manuellement depuis l'admin
    if (entreprise.type === SourceType.HTML_CONFIGURED || entreprise.config) {
      const result = await this.safeRun(this.htmlConfigured.name, () => this.htmlConfigured.extract(entreprise));
      if (result.matched) return { result, usedExtractor: this.htmlConfigured.name };
    }

    // 3-5. Détection automatique générique, dans l'ordre du plus structuré au moins structuré
    const generic = [this.jsonLd, this.rss, this.sitemap, this.htmlGeneric];
    let lastResult: ExtractionResult = { items: [], matched: false };
    for (const extractor of generic) {
      const result = await this.safeRun(extractor.name, () => extractor.extract(entreprise));
      lastResult = result;
      if (result.matched) return { result, usedExtractor: extractor.name };
    }

    return { result: lastResult, usedExtractor: 'AUCUN' };
  }

  private async safeRun(name: string, fn: () => Promise<ExtractionResult>): Promise<ExtractionResult> {
    try {
      return await fn();
    } catch (e: any) {
      this.logger.warn(`Extracteur ${name} a levé une exception non gérée: ${e?.message || e}`);
      return { items: [], matched: false, error: e?.message || String(e) };
    }
  }
}
