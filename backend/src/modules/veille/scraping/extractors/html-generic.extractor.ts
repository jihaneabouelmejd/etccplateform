import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { Entreprise } from '@prisma/client';
import { Extractor, ExtractionResult, RawConsultation } from './extractor.interface';
import { fetchText, resolveUrl } from '../http.util';
import { parseFrenchDate } from '../normalize.util';
import { pagesToScan as buildPagesToScan, looksLikeOpportunity } from '../watch-paths.util';

// Sélecteurs candidats pour repérer une liste répétitive d'annonces sans
// configuration manuelle : on prend le conteneur le plus fréquent qui
// contient un lien + un texte évoquant une consultation.
const LIST_ITEM_SELECTORS = ['article', 'li', '.card', '.item', '.post', '.list-item', 'tr'];

/**
 * Extracteur heuristique HTML générique (dernier recours avant de marquer
 * la source "à configurer"). Repère les blocs répétitifs contenant un lien
 * + un intitulé évoquant un appel d'offres/consultation.
 */
@Injectable()
export class HtmlGenericExtractor implements Extractor {
  readonly name = 'HTML_GENERIC';

  async extract(entreprise: Entreprise): Promise<ExtractionResult> {
    const pages = buildPagesToScan(entreprise, 12);
    if (!pages.length) return { items: [], matched: false, error: 'Pas de site_officiel' };

    const items: RawConsultation[] = [];
    let lastError: string | undefined;

    for (const page of pages) {
      try {
        const html = await fetchText(page);
        const $ = cheerio.load(html);
        const found = this.extractFromPage($, page);
        items.push(...found);
      } catch (e: any) {
        lastError = e?.message || String(e);
      }
    }

    // dédoublonnage intra-batch par URL
    const seen = new Set<string>();
    const unique = items.filter((it) => (seen.has(it.source_url) ? false : (seen.add(it.source_url), true)));

    return { items: unique, matched: unique.length > 0, error: unique.length ? undefined : lastError };
  }

  private extractFromPage($: cheerio.CheerioAPI, pageUrl: string): RawConsultation[] {
    const results: RawConsultation[] = [];

    for (const selector of LIST_ITEM_SELECTORS) {
      const blocks = $(selector);
      if (blocks.length < 2 || blocks.length > 300) continue;

      blocks.each((_, el) => {
        const block = $(el);
        const text = block.text().replace(/\s+/g, ' ').trim();
        if (!text || text.length < 8 || !looksLikeOpportunity(text)) return;

        const link = block.is('a') ? block : block.find('a[href]').first();
        const href = link.attr('href');
        const url = resolveUrl(pageUrl, href) || pageUrl;

        const titleEl = block.find('h1,h2,h3,h4,.title,.titre').first();
        const title = (titleEl.length ? titleEl.text() : link.text() || text).replace(/\s+/g, ' ').trim().slice(0, 300);
        if (!title) return;

        const dateMatch = text.match(/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/);

        results.push({
          source_url: url,
          title,
          description: text.slice(0, 1000),
          date_publication: dateMatch ? parseFrenchDate(dateMatch[1]) : null,
          raw_data: { selector, matchedHeuristic: true },
        });
      });

      if (results.length) break; // premier sélecteur concluant retenu
    }

    return results;
  }
}
