import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { CompanyService } from '../company/company.service';
import { devisTemplate } from './templates/devis.template';
import { blTemplate } from './templates/bl.template';
import { invoiceTemplate, CustomLayout } from './templates/invoice.template';
import { bcTemplate } from './templates/bc.template';

// ─── Cloudinary (pour télécharger les fichiers importés en signé) ────────────
// Les fichiers raw/PDF uploadés sur Cloudinary sont soumis à une restriction
// de sécurité qui bloque leur accès direct (CDN) même en mode "public" →
// on doit passer par l'API Cloudinary signée pour les récupérer, comme le
// fait déjà upload.controller.ts pour la prévisualisation.
const CLOUD_NAME   = (process.env.CLOUDINARY_CLOUD_NAME  || '').trim();
const CLOUD_KEY    = (process.env.CLOUDINARY_API_KEY     || '').trim();
const CLOUD_SECRET = (process.env.CLOUDINARY_API_SECRET  || '').trim();
const USE_CLOUDINARY = !!(CLOUD_NAME && CLOUD_KEY && CLOUD_SECRET);

function extractCloudinaryInfo(url: string): { publicId: string; resourceType: string } | null {
  const m = url.match(/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/(?:upload|authenticated)(?:\/v\d+)?\/(.*?)(?:\?|$)/);
  if (!m) return null;
  return { publicId: m[2], resourceType: m[1] };
}

function buildCloudinarySignedDownloadUrl(publicId: string, resourceType: string): string | null {
  if (!USE_CLOUDINARY) return null;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const type = 'upload';
    const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}&type=${type}`;
    const signature = require('crypto')
      .createHash('sha1')
      .update(paramsToSign + CLOUD_SECRET)
      .digest('hex');
    const qs = new URLSearchParams({
      public_id: publicId,
      type,
      api_key: CLOUD_KEY,
      timestamp: String(timestamp),
      signature,
    });
    return `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/download?${qs.toString()}`;
  } catch {
    return null;
  }
}

export type PDFLanguage = 'FR' | 'AR';

export interface DevisPDFData {
  number: string;
  issue_date: string;
  validity_days: number;
  expires_at: string;
  object?: string;
  site?: string;
  client: {
    commercial_name: string;
    ice?: string;
    rc?: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
  };
  lines: { description: string; quantity: number; unit_price: number; total_ht: number }[];
  total_ht_brut: number;
  discount_rate: number;
  discount_amount: number;
  total_ht_net: number;
  tva_rate: number;
  tva_amount: number;
  total_ttc: number;
  payment_terms?: string;
  notes?: string;
  signature_url?: string;
  creator_name: string;
}

export interface BLPDFData {
  number: string;
  bc_number?: string;
  devis_number?: string;
  site?: string;
  issue_date: string;
  delivery_date?: string;
  client: { commercial_name: string; ice?: string; address?: string; city?: string };
  project_name?: string;
  lines: { description: string; quantity: number }[];
  delivered_by?: string;
  delivery_address?: string;
  notes?: string;
  signature_url?: string;
}

export interface InvoicePDFData {
  number: string;
  bl_number?: string;
  bc_number?: string;
  bc_client_number?: string;
  devis_number?: string;
  site?: string;
  issue_date: string;
  due_date?: string;
  client: {
    commercial_name: string;
    ice?: string;
    rc?: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
  };
  lines: { description: string; quantity: number; unit_price: number; total_ht: number }[];
  total_ht_brut: number;
  discount_rate: number;
  discount_amount: number;
  total_ht_net: number;
  tva_rate: number;
  tva_amount: number;
  total_ttc: number;
  acompte_amount: number;
  retenue_garantie_rate?: number;
  balance: number;
  payment_method?: string;
  payment_terms?: string;
  notes?: string;
  signature_url?: string;
  custom_layout?: CustomLayout | null;
}

export interface BCPDFData {
  number: string;
  issue_date: string;
  expected_delivery?: string;
  status?: string;
  source?: string;
  devis_number?: string;
  site?: string;
  client: {
    commercial_name: string;
    ice?: string;
    rc?: string;
    address?: string;
    city?: string;
    phone?: string;
    email?: string;
  };
  lines: { description: string; quantity: number; unit_price?: number }[];
  total_ht?: number;
  total_ttc?: number;
  notes?: string;
  signature_url?: string;
}

export interface PurchaseInvoicePDFData {
  number: string;
  issue_date: string;
  due_date?: string;
  fournisseur_name: string;
  total_ht: number;
  tva_amount: number;
  total_ttc: number;
  notes?: string;
}

@Injectable()
export class PDFService {
  private readonly logger = new Logger(PDFService.name);

  constructor(private companyService: CompanyService) {}

  /**
   * Résout une URL potentiellement relative (ex: uploads locaux servis par ce
   * même backend quand Cloudinary n'est pas configuré — format
   * "/api/upload/files/xxx.pdf") en URL absolue utilisable pour un fetch HTTP
   * côté serveur. Sans ça, un require('http').get() sur un chemin relatif
   * lève une exception "Invalid URL" silencieusement avalée par le catch
   * englobant, et l'appelant retombe à tort sur le PDF gabarit généré au lieu
   * du fichier réellement importé. Les URLs déjà absolues (Cloudinary, etc.)
   * sont retournées telles quelles.
   */
  private resolveUrl(url: string): string {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    const origin = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
    return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  /**
   * Télécharge une image depuis son URL et la convertit en data URI base64.
   * Cela évite que Puppeteer tente de charger des URLs Cloudinary depuis
   * le container Railway (pas de requêtes réseau externes dans le HTML).
   */
  private async imageUrlToBase64(url: string): Promise<string | null> {
    if (!url) return null;
    const resolved = this.resolveUrl(url);
    try {
      // Dynamic import to avoid issues with ESM/CJS
      const https = resolved.startsWith('https') ? require('https') : require('http');
      return await new Promise<string | null>((resolve) => {
        https.get(resolved, (res: any) => {
          if (res.statusCode !== 200) { resolve(null); return; }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const buf = Buffer.concat(chunks);
            const contentType = res.headers['content-type'] || 'image/png';
            resolve(`data:${contentType};base64,${buf.toString('base64')}`);
          });
          res.on('error', () => resolve(null));
        }).on('error', () => resolve(null));
      });
    } catch {
      return null;
    }
  }

  /**
   * Télécharge un fichier (URL Cloudinary ou locale) et le renvoie tel quel
   * sous forme de Buffer, en suivant les redirections HTTP.
   */
  private async fetchUrlBuffer(
    url: string,
    hops = 0,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (hops > 5) return null;

    // ── Cloudinary raw/PDF resources: le CDN direct renvoie 401 (restriction
    // de sécurité sur les fichiers raw/PDF/ZIP), même en mode "public" upload.
    // On tente donc d'abord l'API de téléchargement signée. ────────────────
    if (url.includes('cloudinary.com') && USE_CLOUDINARY) {
      const info = extractCloudinaryInfo(url);
      if (info) {
        const signedUrl = buildCloudinarySignedDownloadUrl(info.publicId, info.resourceType);
        if (signedUrl) {
          const signedResult = await this.fetchRawUrl(signedUrl, hops);
          if (signedResult) return signedResult;
          this.logger.warn(`[fetchUrlBuffer] Signed Cloudinary download failed — fallback CDN direct: ${url}`);
        }
      }
    }

    const resolved = this.resolveUrl(url);
    return this.fetchRawUrl(resolved, hops);
  }

  private async fetchRawUrl(
    resolved: string,
    hops = 0,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    if (hops > 5) return null;
    try {
      const https = resolved.startsWith('https') ? require('https') : require('http');
      return await new Promise((resolve) => {
        https.get(resolved, (res: any) => {
          const sc = res.statusCode;
          if ([301, 302, 303, 307, 308].includes(sc) && res.headers.location) {
            res.resume();
            this.fetchRawUrl(res.headers.location, hops + 1).then(resolve);
            return;
          }
          if (sc !== 200) { res.resume(); resolve(null); return; }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
          res.on('error', () => resolve(null));
        }).on('error', () => resolve(null));
      });
    } catch {
      return null;
    }
  }

  /**
   * Pour un BC/BL importé depuis l'extérieur (source IMPORTED_OCR / IMPORTED_MANUAL),
   * le document réel à afficher/fusionner est le fichier que le client a téléversé
   * (imported_file_url) — PAS un gabarit ETCC généré à partir des lignes en BDD
   * (qui ne contiennent souvent qu'un nom de fichier placeholder).
   * Cette méthode télécharge ce fichier et le renvoie en PDF :
   *  - si c'est déjà un PDF → renvoyé tel quel
   *  - si c'est une image (jpg/png/...) → encapsulée dans une page PDF A4
   * Renvoie null si le téléchargement échoue (l'appelant doit alors fallback
   * sur le gabarit généré, pour ne jamais bloquer l'utilisateur).
   */
  async fetchImportedFileAsPdf(url: string): Promise<Buffer | null> {
    if (!url) return null;
    const result = await this.fetchUrlBuffer(url);
    if (!result || !result.buffer || result.buffer.length === 0) return null;
    const { buffer, contentType } = result;

    const urlPath = url.split('?')[0].toLowerCase();
    const isPdf = contentType.includes('pdf') || urlPath.endsWith('.pdf') || url.includes('/raw/');
    if (isPdf) return buffer;

    // Image → page PDF A4 avec l'image centrée
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      let image: any;
      const isPng = contentType.includes('png') || urlPath.endsWith('.png');
      try {
        image = isPng ? await pdfDoc.embedPng(buffer) : await pdfDoc.embedJpg(buffer);
      } catch {
        // Type mal détecté — on tente l'autre format
        image = isPng ? await pdfDoc.embedJpg(buffer) : await pdfDoc.embedPng(buffer);
      }
      const pageW = 595.28;
      const pageH = 841.89;
      const margin = 20;
      const scale = Math.min((pageW - margin * 2) / image.width, (pageH - margin * 2) / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      const page = pdfDoc.addPage([pageW, pageH]);
      page.drawImage(image, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h });
      return Buffer.from(await pdfDoc.save());
    } catch (err: any) {
      this.logger.error(`[fetchImportedFileAsPdf] Conversion image→PDF échouée: ${err.message}`);
      return null;
    }
  }

  private async generateFromHTML(html: string): Promise<Buffer> {
    let browser: any;
    try {
      // Résolution automatique du chemin Chrome — cherche dans plusieurs emplacements
      let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '';

      if (!executablePath) {
        try {
          // Essai 1 : chemin auto via puppeteer
          executablePath = puppeteer.executablePath();
        } catch {}
      }

      if (!executablePath) {
        const fs = await import('fs');
        const path = await import('path');
        const userHome = process.env.USERPROFILE || process.env.HOME || `C:\\Users\\${process.env.USERNAME || 'JIHANE'}`;

        // Essai 2 : scan du cache puppeteer
        const cacheDir = path.join(userHome, '.cache', 'puppeteer', 'chrome');
        if (fs.existsSync(cacheDir)) {
          const versions = fs.readdirSync(cacheDir);
          for (const v of versions) {
            const candidates = [
              path.join(cacheDir, v, 'chrome-win64', 'chrome.exe'),
              path.join(cacheDir, v, 'chrome-win32', 'chrome.exe'),
              path.join(cacheDir, v, 'chrome-linux', 'chrome'),
            ];
            for (const c of candidates) {
              if (fs.existsSync(c)) { executablePath = c; break; }
            }
            if (executablePath) break;
          }
        }

        // Essai 3 : Chrome système Windows (déjà installé)
        if (!executablePath) {
          const systemChromes = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(userHome, 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          ];
          for (const c of systemChromes) {
            if (fs.existsSync(c)) { executablePath = c; break; }
          }
        }

        if (executablePath) {
          this.logger.log(`Chrome trouvé : ${executablePath}`);
        } else {
          this.logger.warn('Aucun Chrome trouvé, tentative sans executablePath');
        }
      }

      browser = await puppeteer.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
    } catch (launchErr: any) {
      this.logger.error('Puppeteer launch failed:', launchErr?.message);
      throw new InternalServerErrorException(
        'Chromium introuvable. Lancez : cd backend && npx puppeteer browsers install chrome',
      );
    }
    try {
      const page = await browser.newPage();
      const backendOrigin = process.env.APP_URL || 'http://localhost:4000';
      const htmlWithBase = html.replace('<head>', `<head><base href="${backendOrigin}">`);
      await page.setContent(htmlWithBase, { waitUntil: 'networkidle0', timeout: 30000 });
      // Re-run the single-page fit (if the template defines one) right before printing,
      // in case fonts/images finished loading after the template's own inline call.
      await page.evaluate(() => {
        // @ts-ignore - fitPageToA4 is defined inline by templates that support single-page fit
        if (typeof (window as any).fitPageToA4 === 'function') (window as any).fitPageToA4();
      });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }

  async generateDevisPDF(data: DevisPDFData, lang: PDFLanguage = 'FR'): Promise<Buffer> {
    const company = await this.companyService.getPdfData();
    const sigBase64 = data.signature_url ? await this.imageUrlToBase64(data.signature_url) : undefined;
    const logoBase64 = company.logo_url ? await this.imageUrlToBase64(company.logo_url) : undefined;
    const html = devisTemplate({
      ...data,
      signature_url: sigBase64 || undefined,
      company: { ...company, logo_url: logoBase64 || company.logo_url },
      lang,
    });
    return this.generateFromHTML(html);
  }

  async generateBLPDF(data: BLPDFData, lang: PDFLanguage = 'FR'): Promise<Buffer> {
    const company = await this.companyService.getPdfData();
    const sigBase64 = data.signature_url ? await this.imageUrlToBase64(data.signature_url) : undefined;
    const logoBase64 = company.logo_url ? await this.imageUrlToBase64(company.logo_url) : undefined;
    const html = blTemplate({
      ...data,
      signature_url: sigBase64 || undefined,
      company: { ...company, logo_url: logoBase64 || company.logo_url },
      lang,
    });
    return this.generateFromHTML(html);
  }

  async generateInvoicePDF(data: InvoicePDFData, lang: PDFLanguage = 'FR'): Promise<Buffer> {
    const company = await this.companyService.getPdfData();
    const sigBase64 = data.signature_url ? await this.imageUrlToBase64(data.signature_url) : undefined;
    const logoBase64 = company.logo_url ? await this.imageUrlToBase64(company.logo_url) : undefined;
    const html = invoiceTemplate({
      ...data,
      signature_url: sigBase64 || undefined,
      company: { ...company, logo_url: logoBase64 || company.logo_url },
      lang,
    });
    return this.generateFromHTML(html);
  }

  async generateBCPDF(data: BCPDFData, lang: PDFLanguage = 'FR'): Promise<Buffer> {
    const company = await this.companyService.getPdfData();
    const sigBase64 = data.signature_url ? await this.imageUrlToBase64(data.signature_url) : undefined;
    const logoBase64 = company.logo_url ? await this.imageUrlToBase64(company.logo_url) : undefined;
    const html = bcTemplate({
      ...data,
      signature_url: sigBase64 || undefined,
      company: { ...company, logo_url: logoBase64 || company.logo_url },
      lang,
    });
    return this.generateFromHTML(html);
  }

  async generatePurchaseInvoicePDF(data: PurchaseInvoicePDFData): Promise<Buffer> {
    const company = await this.companyService.getPdfData();
    const fmtAmt = (n: number) =>
      n.toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MAD';
    const fmtDate = (s: string) => new Date(s).toLocaleDateString('fr-FR');

    const html = [
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>',
      '* { margin:0; padding:0; box-sizing:border-box; }',
      'body { font-family: Segoe UI, Arial, sans-serif; background:#FFFDF8; color:#1A141A; font-size:13px; padding:32px; }',
      '.header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; padding-bottom:20px; border-bottom:2px solid #E8D4B0; }',
      '.company { font-size:20px; font-weight:800; color:#1A141A; }',
      '.badge { background:linear-gradient(135deg,#F4B315,#E59312); color:#1A141A; padding:6px 18px; border-radius:20px; font-size:12px; font-weight:700; }',
      '.info-grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-bottom:28px; }',
      '.info-box { background:white; border:1px solid #E8D4B0; border-radius:10px; padding:16px; }',
      '.info-box h3 { font-size:10px; font-weight:700; color:#8E5915; text-transform:uppercase; letter-spacing:0.8px; margin-bottom:10px; }',
      '.totals { background:white; border:1.5px solid #E8D4B0; border-radius:12px; padding:20px; max-width:340px; margin-left:auto; }',
      '.tr { display:flex; justify-content:space-between; padding:7px 0; border-bottom:1px solid #F5E6D3; font-size:13px; }',
      '.tr.last { border-bottom:none; font-size:16px; font-weight:800; color:#A33C00; margin-top:4px; }',
      '.notes { background:#FFF8EE; border:1px solid #E8D4B0; border-radius:8px; padding:12px 16px; margin-top:20px; font-size:12px; color:#8E5915; }',
      '.footer { margin-top:32px; text-align:center; font-size:10px; color:#B8A090; border-top:1px solid #F5E6D3; padding-top:14px; }',
      '</style></head><body>',
      '<div class="header">',
      '<div><div class="company">' + (company.name || 'ETCC') + '<span style="color:#8E5915">.</span></div>',
      '<div style="font-size:11px;color:#8E5915;margin-top:4px;">' + (company.address || '') + '</div></div>',
      '<div style="text-align:right"><div class="badge">FACTURE D\'ACHAT</div>',
      '<div style="font-family:monospace;font-size:18px;font-weight:800;margin-top:8px;">' + data.number + '</div></div>',
      '</div>',
      '<div class="info-grid">',
      '<div class="info-box"><h3>Fournisseur</h3>',
      '<p style="font-weight:700;font-size:14px;">' + data.fournisseur_name + '</p></div>',
      '<div class="info-box"><h3>Dates</h3>',
      '<p>Date : <strong>' + fmtDate(data.issue_date) + '</strong></p>',
      data.due_date ? '<p>Echeance : <strong>' + fmtDate(data.due_date) + '</strong></p>' : '',
      '</div></div>',
      '<div class="totals">',
      '<div class="tr"><span>Montant HT</span><span>' + fmtAmt(data.total_ht) + '</span></div>',
      '<div class="tr"><span>TVA 20%</span><span>' + fmtAmt(data.tva_amount) + '</span></div>',
      '<div class="tr last"><span>Total TTC</span><span>' + fmtAmt(data.total_ttc) + '</span></div>',
      '</div>',
      data.notes ? '<div class="notes">' + data.notes + '</div>' : '',
      '<div class="footer">' + (company.name || 'ETCC') + ' &bull; ICE: ' + (company.ice || 'N/A') + '</div>',
      '</body></html>',
    ].join('\n');

    return this.generateFromHTML(html);
  }
}
