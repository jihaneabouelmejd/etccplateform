import { Module } from '@nestjs/common';
import { EntreprisesController } from './entreprises/entreprises.controller';
import { EntreprisesService } from './entreprises/entreprises.service';
import { ConsultationsController } from './consultations/consultations.controller';
import { ConsultationsService } from './consultations/consultations.service';
import { ScrapingOrchestratorService } from './scraping/scraping-orchestrator.service';
import { ScrapingSchedulerService } from './scraping/scraping-scheduler.service';
import { ExtractorPipelineService } from './scraping/extractors/extractor-pipeline.service';
import { JsonLdExtractor } from './scraping/extractors/json-ld.extractor';
import { RssExtractor } from './scraping/extractors/rss.extractor';
import { SitemapExtractor } from './scraping/extractors/sitemap.extractor';
import { HtmlGenericExtractor } from './scraping/extractors/html-generic.extractor';
import { HtmlConfiguredExtractor } from './scraping/extractors/html-configured.extractor';
import { PluginRegistryService } from './scraping/plugins/plugin-registry.service';
import { MarchesPrivesModule } from '../marches-prives/marches-prives.module';

/**
 * Module VEILLE — plateforme de veille commerciale (Entreprises à
 * surveiller + Consultations détectées). Totalement additif : ne modifie
 * aucun module existant. Seule dépendance externe : MarchesPrivesModule,
 * utilisé uniquement pour l'action manuelle "Importer" une consultation en
 * marché privé (réutilisation par référence, jamais de duplication de
 * logique).
 */
@Module({
  imports: [MarchesPrivesModule],
  controllers: [EntreprisesController, ConsultationsController],
  providers: [
    EntreprisesService,
    ConsultationsService,
    ScrapingOrchestratorService,
    ScrapingSchedulerService,
    ExtractorPipelineService,
    JsonLdExtractor,
    RssExtractor,
    SitemapExtractor,
    HtmlGenericExtractor,
    HtmlConfiguredExtractor,
    PluginRegistryService,
  ],
  exports: [EntreprisesService, ConsultationsService, ScrapingOrchestratorService],
})
export class VeilleModule {}
