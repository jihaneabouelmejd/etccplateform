import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { Entreprise } from '@prisma/client';
import { Extractor, ExtractionResult, RawConsultation } from './extractor.interface';
import { fetchText, resolveUrl } from '../http.util';
import { parseFrenchDate } from '../normalize.util';

const CANDIDATE_PATHS = ['/feed', '/rss', '/rss.xml', '/feed.xml', '/atom.xml', '/?feed=rss2'];

/**
 * Extracteur RSS / Atom. Essaie les chemins de flux les plus courants sous
 * le site officiel, plus toute page déclarée dans pages_surveillees qui
 * ressemble déjà à un flux (contient "rss"/"feed"/"atom").
 */
@Injectable()
export class RssExtractor implements Extractor {
  readonly name = 'RSS';
  private parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

  async extract(entreprise: Entreprise): Promise<ExtractionResult> {
    const base = entreprise.site_officiel;
    if (!base) return { items: [], matched: false, error: 'Pas de site_officiel' };

    const declared = (entreprise.pages_surveillees || []).filter((p) => /rss|feed|atom/i.test(p));
    const candidates = [...declared, ...CANDIDATE_PATHS]
      .map((p) => resolveUrl(base, p))
      .filter(Boolean) as string[];

    let lastError: string | undefined;
    for (const url of [...new Set(candidates)]) {
      try {
        const xml = await fetchText(url);
        if (!/<rss|<feed/i.test(xml)) continue;
        const items = this.parse(xml, url);
        if (items.length) return { items, matched: true };
      } catch (e: any) {
        lastError = e?.message || String(e);
      }
    }
    return { items: [], matched: false, error: lastError };
  }

  private parse(xml: string, feedUrl: string): RawConsultation[] {
    const doc = this.parser.parse(xml);
    const results: RawConsultation[] = [];

    const rssItems = doc?.rss?.channel?.item;
    if (rssItems) {
      const list = Array.isArray(rssItems) ? rssItems : [rssItems];
      for (const it of list) {
        const link = typeof it.link === 'string' ? it.link : it.link?.['#text'] || it.guid;
        if (!it.title || !link) continue;
        results.push({
          source_url: resolveUrl(feedUrl, link) || link,
          title: String(it.title),
          description: it.description ? String(it.description).replace(/<[^>]+>/g, ' ') : null,
          date_publication: parseFrenchDate(it.pubDate),
          raw_data: it,
        });
      }
    }

    const atomEntries = doc?.feed?.entry;
    if (atomEntries) {
      const list = Array.isArray(atomEntries) ? atomEntries : [atomEntries];
      for (const it of list) {
        const link = Array.isArray(it.link) ? it.link[0]?.['@_href'] : it.link?.['@_href'];
        if (!it.title || !link) continue;
        results.push({
          source_url: resolveUrl(feedUrl, link) || link,
          title: typeof it.title === 'string' ? it.title : it.title?.['#text'] || '',
          description: it.summary ? String(it.summary).replace(/<[^>]+>/g, ' ') : null,
          date_publication: parseFrenchDate(it.published || it.updated),
          raw_data: it,
        });
      }
    }

    return results;
  }
}
