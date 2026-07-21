import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { Entreprise } from '@prisma/client';
import { Extractor, ExtractionResult, RawConsultation } from './extractor.interface';
import { fetchText, resolveUrl } from '../http.util';
import { parseFrenchDate, parseBudget } from '../normalize.util';
import { pagesToScan } from '../watch-paths.util';

/**
 * Extracteur JSON-LD : cherche des balises <script type="application/ld+json">
 * décrivant des offres (schema.org JobPosting réutilisé par certains sites
 * pour des "consultations", Offer, ou tout objet avec title/description/url).
 * Fonctionne sur la page d'accueil + les pages à surveiller déclarées.
 */
@Injectable()
export class JsonLdExtractor implements Extractor {
  readonly name = 'JSON_LD';

  async extract(entreprise: Entreprise): Promise<ExtractionResult> {
    const pages = pagesToScan(entreprise, 8);
    const items: RawConsultation[] = [];
    let matchedAny = false;
    let lastError: string | undefined;

    for (const page of pages) {
      try {
        const html = await fetchText(page);
        const $ = cheerio.load(html);
        const scripts = $('script[type="application/ld+json"]');
        if (!scripts.length) continue;

        scripts.each((_, el) => {
          try {
            const json = JSON.parse($(el).contents().text());
            const nodes = Array.isArray(json) ? json : json['@graph'] ? json['@graph'] : [json];
            for (const node of nodes) {
              const parsed = this.parseNode(node, page);
              if (parsed) {
                items.push(parsed);
                matchedAny = true;
              }
            }
          } catch {
            // bloc JSON-LD invalide, on ignore ce script précis
          }
        });
      } catch (e: any) {
        lastError = e?.message || String(e);
      }
    }

    return { items, matched: matchedAny, error: matchedAny ? undefined : lastError };
  }

  private parseNode(node: any, pageUrl: string): RawConsultation | null {
    if (!node || typeof node !== 'object') return null;
    const type = node['@type'];
    const relevantTypes = ['JobPosting', 'Offer', 'Event', 'Article', 'CreativeWork'];
    if (type && !relevantTypes.includes(type) && !Array.isArray(type)) {
      // on tolère aussi les types custom contenant "offre"/"consultation"
      if (typeof type !== 'string' || !/offre|consult|tender|appel/i.test(type)) return null;
    }
    const title = node.title || node.name || node.headline;
    if (!title) return null;

    const url = resolveUrl(pageUrl, node.url) || pageUrl;
    const budgetRaw = node.baseSalary?.value?.value || node.estimatedSalary || node.offers?.price;
    const { montant, devise } = parseBudget(budgetRaw ? String(budgetRaw) : null);

    return {
      external_id: node.identifier?.value || node.identifier || null,
      source_url: url,
      title: String(title),
      description: node.description ? String(node.description) : null,
      ville: node.jobLocation?.address?.addressLocality || node.location?.name || null,
      maitre_ouvrage: node.hiringOrganization?.name || node.organizer?.name || null,
      date_publication: parseFrenchDate(node.datePosted || node.startDate),
      date_limite: parseFrenchDate(node.validThrough || node.endDate),
      budget_estimatif: montant,
      devise,
      raw_data: node,
    };
  }
}
