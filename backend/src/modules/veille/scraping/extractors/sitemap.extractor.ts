import { Injectable } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { Entreprise } from '@prisma/client';
import { Extractor, ExtractionResult, RawConsultation } from './extractor.interface';
import { fetchText, resolveUrl } from '../http.util';
import { OPPORTUNITY_KEYWORDS_REGEX } from '../watch-paths.util';

const RELEVANT_SLUG = new RegExp(
  OPPORTUNITY_KEYWORDS_REGEX.source + '|achats|suppliers|vendor|rfq|rfp|projets',
  'i',
);

/**
 * Extracteur sitemap.xml : repère les URLs dont le chemin évoque un
 * appel d'offres/consultation, puis tente une extraction générique du
 * <title>/meta description de chaque page trouvée (fallback léger, sans
 * heuristique HTML complète — l'extracteur HTML générique prend le relais
 * si besoin de plus de détails).
 */
@Injectable()
export class SitemapExtractor implements Extractor {
  readonly name = 'SITEMAP';
  private parser = new XMLParser({ ignoreAttributes: false });

  async extract(entreprise: Entreprise): Promise<ExtractionResult> {
    const base = entreprise.site_officiel;
    if (!base) return { items: [], matched: false, error: 'Pas de site_officiel' };

    const sitemapUrl = resolveUrl(base, '/sitemap.xml');
    if (!sitemapUrl) return { items: [], matched: false };

    try {
      const xml = await fetchText(sitemapUrl);
      const urls = this.collectUrls(xml, sitemapUrl);
      const relevant = urls.filter((u) => RELEVANT_SLUG.test(u)).slice(0, 100);
      if (!relevant.length) return { items: [], matched: false, error: 'Aucune URL pertinente dans le sitemap' };

      const items: RawConsultation[] = relevant.map((url) => ({
        source_url: url,
        title: this.slugToTitle(url),
        raw_data: { fromSitemap: true },
      }));
      return { items, matched: true };
    } catch (e: any) {
      return { items: [], matched: false, error: e?.message || String(e) };
    }
  }

  private collectUrls(xml: string, sitemapUrl: string): string[] {
    const doc = this.parser.parse(xml);
    // sitemap index -> on ne descend qu'un niveau pour rester rapide/robuste
    if (doc?.sitemapindex?.sitemap) {
      const subs = Array.isArray(doc.sitemapindex.sitemap) ? doc.sitemapindex.sitemap : [doc.sitemapindex.sitemap];
      return subs.map((s: any) => s.loc).filter(Boolean).slice(0, 20);
    }
    const urlset = doc?.urlset?.url;
    if (!urlset) return [];
    const list = Array.isArray(urlset) ? urlset : [urlset];
    return list.map((u: any) => resolveUrl(sitemapUrl, u.loc)).filter(Boolean) as string[];
  }

  private slugToTitle(url: string): string {
    try {
      const path = new URL(url).pathname.replace(/\/$/, '');
      const slug = path.split('/').pop() || path;
      return slug.replace(/[-_]/g, ' ').replace(/\.\w+$/, '').trim() || url;
    } catch {
      return url;
    }
  }
}
