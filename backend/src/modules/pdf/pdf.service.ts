import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import puppeteer from 'puppeteer';
import { CompanyService } from '../company/company.service';
import { devisTemplate } from './templates/devis.template';
import { blTemplate } from './templates/bl.template';
import { invoiceTemplate } from './templates/invoice.template';
import { bcTemplate } from './templates/bc.template';

export type PDFLanguage = 'FR' | 'AR';

export interface DevisPDFData {
  number: string;
  issue_date: string;
  validity_days: number;
  expires_at: string;
  object?: string;
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
  devis_number?: string;
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
  balance: number;
  payment_method?: string;
  payment_terms?: string;
  notes?: string;
  signature_url?: string;
}

export interface BCPDFData {
  number: string;
  issue_date: string;
  expected_delivery?: string;
  status?: string;
  source?: string;
  devis_number?: string;
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
   * Télécharge une image depuis son URL et la convertit en data URI base64.
   * Cela évite que Puppeteer tente de charger des URLs Cloudinary depuis
   * le container Railway (pas de requêtes réseau externes dans le HTML).
   */
  private async imageUrlToBase64(url: string): Promise<string | null> {
    if (!url) return null;
    try {
      // Dynamic import to avoid issues with ESM/CJS
      const https = url.startsWith('https') ? require('https') : require('http');
      return await new Promise<string | null>((resolve) => {
        https.get(url, (res: any) => {
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
      signature_url: sigBase64 || data.signature_url,
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
      signature_url: sigBase64 || data.signature_url,
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
      signature_url: sigBase64 || data.signature_url,
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
      signature_url: sigBase64 || data.signature_url,
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
      '.info-grid 