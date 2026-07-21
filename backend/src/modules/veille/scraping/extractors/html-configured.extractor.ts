import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { Entreprise } from '@prisma/client';
import { Extractor, ExtractionResult, RawConsultation } from './extractor.interface';
import { fetchText, resolveUrl } from '../http.util';
import { parseFrenchDate, parseBudget } from '../normalize.util';

/**
 * Config attendue dans Entreprise.config (JSON), éditable depuis l'admin
 * "Sources à configurer" sans toucher au code :
 * {
 *   "listUrl": "/appels-offres",       // optionnel, sinon site_officiel
 *   "listSelector": ".ao-item",        // conteneur répété d'une annonce
 *   "titleSelector": ".ao-title",
 *   "linkSelector": "a",               // relatif au conteneur, ou vide -> le conteneur lui-même si <a>
 *   "descriptionSelector": ".ao-desc",
 *   "dateLimiteSelector": ".ao-deadline",
 *   "datePublicationSelector": ".ao-date",
 *   "villeSelector": ".ao-ville",
 *   "budgetSelector": ".ao-budget"
 * }
 */
interface HtmlConfig {
  listUrl?: string;
  listSelector: string;
  titleSelector?: string;
  linkSelector?: string;
  descriptionSelector?: string;
  dateLimiteSelector?: string;
  datePublicationSelector?: string;
  villeSelector?: string;
  budgetSelector?: string;
}

@Injectable()
export class HtmlConfiguredExtractor implements Extractor {
  readonly name = 'HTML_CONFIGURED';

  async extract(entreprise: Entreprise): Promise<ExtractionResult> {
    const config = entreprise.config as unknown as HtmlConfig | null;
    if (!config?.listSelector) {
      return { items: [], matched: false, error: 'Aucune configuration de sélecteurs CSS' };
    }
    const base = entreprise.site_officiel;
    if (!base) return { items: [], matched: false, error: 'Pas de site_officiel' };

    const targetUrl = resolveUrl(base, config.listUrl) || base;

    try {
      const html = await fetchText(targetUrl);
      const $ = cheerio.load(html);
      const items: RawConsultation[] = [];

      $(config.listSelector).each((_, el) => {
        const block = $(el);
        const linkEl = config.linkSelector ? block.find(config.linkSelector).first() : block.is('a') ? block : block.find('a').first();
        const href = linkEl.attr('href') || (block.is('a') ? block.attr('href') : undefined);
        const url = resolveUrl(targetUrl, href) || targetUrl;

        const title = (config.titleSelector ? block.find(config.titleSelector).first().text() : linkEl.text() || block.text())
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 300);
        if (!title) return;

        const description = config.descriptionSelector ? block.find(config.descriptionSelector).first().text().trim() : null;
        const ville = config.villeSelector ? block.find(config.villeSelector).first().text().trim() : null;
        const budgetText = config.budgetSelector ? block.find(config.budgetSelector).first().text().trim() : null;
        const { montant, devise } = parseBudget(budgetText);

        items.push({
          source_url: url,
          title,
          description: description || null,
          ville: ville || null,
          budget_estimatif: montant,
          devise,
          date_limite: config.dateLimiteSelector ? parseFrenchDate(block.find(config.dateLimiteSelector).first().text()) : null,
          date_publication: config.datePublicationSelector ? parseFrenchDate(block.find(config.datePublicationSelector).first().text()) : null,
          raw_data: { fromConfiguredSelectors: true },
        });
      });

      return { items, matched: items.length > 0, error: items.length ? undefined : 'Sélecteurs configurés mais aucune annonce trouvée' };
    } catch (e: any) {
      return { items: [], matched: false, error: e?.message || String(e) };
    }
  }
}
