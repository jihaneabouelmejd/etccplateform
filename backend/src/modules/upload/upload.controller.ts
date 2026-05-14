import {
  Controller, Post, UploadedFile, UseInterceptors, UseGuards,
  BadRequestException, Get, Param, Res, Query, InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Response } from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { Readable } from 'stream';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

// ─── Cloudinary setup ────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || 'etcc';
const USE_CLOUDINARY = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

// ─── Local fallback (dev / if Cloudinary not configured) ─────────────────────
const uploadsPath = process.env.UPLOADS_PATH || join(process.cwd(), 'uploads');
if (!USE_CLOUDINARY && !fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// ─── Upload buffer → Cloudinary ───────────────────────────────────────────────
function uploadBufferToCloudinary(
  buffer: Buffer,
  originalname: string,
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const resourceType = /\.(pdf)$/i.test(originalname) ? 'raw' : 'image';
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_FOLDER,
        resource_type: resourceType,
        use_filename: false,
        unique_filename: true,
      },
      (error: any, result: any) => {
        if (error) {
          console.error('[Cloudinary] Upload error:', error);
          return reject(error);
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    Readable.from(buffer).pipe(uploadStream);
  });
}

// ─── Download a URL to a temp file (for OCR on Cloudinary files) ─────────────
async function downloadToTmp(url: string): Promise<string> {
  // Detect extension from URL
  const urlWithoutQuery = url.split('?')[0];
  let ext = extname(urlWithoutQuery) || '.tmp';
  // Cloudinary raw resources (PDFs) may not have extension in URL
  if (!ext || ext === '.tmp') {
    ext = url.includes('/raw/') ? '.pdf' : '.jpg';
  }
  const tmpPath = join(os.tmpdir(), `ocr_${crypto.randomBytes(8).toString('hex')}${ext}`);

  // Use node https/http to download
  const https = url.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpPath);
    https.get(url, (response: any) => {
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(tmpPath); });
    }).on('error', (err: any) => {
      fs.unlink(tmpPath, () => {});
      reject(err);
    });
  });
}

// ─── OCR: parse invoice text ──────────────────────────────────────────────────
function parseInvoiceText(text: string): Record<string, any> {
  const clean = text.replace(/\r/g, ' ').replace(/[ \t]+/g, ' ');
  const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  console.log('[OCR] Extracted', lines.length, 'lines');
  console.log('[OCR] First 10 lines:', lines.slice(0, 10));

  const parseAmount = (s: string): number => {
    if (!s) return 0;
    return parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0;
  };

  const AMT = /([\d][\d\s]{0,10}[,.]\d{2})/;

  let total_ttc: number | null = null;
  for (const line of lines) {
    if (/net\s*[aà]\s*pay[ée]r?|total\s*ttc|montant\s*ttc|total\s*t\.t\.c\.|arrêté|net\s*commercial/i.test(line)) {
      const m = line.match(AMT);
      if (m) { total_ttc = parseAmount(m[1]); break; }
    }
  }

  let total_ht: number | null = null;
  for (const line of lines) {
    if (/(?:total\s*)?(?:h\.?t\.?|hors\s*taxe|montant\s*ht|base\s*ht|sous[- ]total)/i.test(line)) {
      const m = line.match(AMT);
      if (m) { total_ht = parseAmount(m[1]); break; }
    }
  }

  let tva_amount: number | null = null;
  for (const line of lines) {
    if (/t\.?v\.?a\.?/i.test(line) && !/exon[eé]/i.test(line)) {
      const m = line.match(AMT);
      if (m) { tva_amount = parseAmount(m[1]); break; }
    }
  }

  if (!total_ttc) {
    const allAmounts = [...clean.matchAll(new RegExp(AMT.source, 'g'))]
      .map(m => parseAmount(m[1]))
      .filter(n => n > 10 && n < 10_000_000)
      .sort((a, b) => a - b);
    if (allAmounts.length > 0) total_ttc = allAmounts[allAmounts.length - 1];
  }

  if (total_ttc && !total_ht) total_ht = Math.round((total_ttc / 1.2) * 100) / 100;
  if (total_ht && total_ttc && !tva_amount) tva_amount = Math.round((total_ttc - total_ht) * 100) / 100;

  let issue_date: string | null = null;
  for (const line of lines) {
    if (/date|le\s+\d/i.test(line)) {
      const m = line.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
      if (m) {
        let [, d, mo, y] = m;
        if (y.length === 2) y = '20' + y;
        issue_date = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
        break;
      }
    }
  }
  if (!issue_date) {
    const m = clean.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) {
      let [, d, mo, y] = m;
      issue_date = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
  }

  let ref_fournisseur: string | null = null;
  for (const line of lines) {
    const m = line.match(/(?:n[o°]?\s*(?:facture|fact\.?)|facture\s*n[o°]?\s*:?|ref(?:erence)?\s*[:.]?)\s*([A-Z0-9][\w\/-]{2,20})/i);
    if (m) { ref_fournisseur = m[1].trim(); break; }
  }

  let fournisseur_name: string | null = null;
  for (const line of lines.slice(0, 25)) {
    const m = line.match(/^(?:de|vendeur|fournisseur|societe|soci[eé]t[eé]|raison\s*sociale|[eé]metteur|exp[eé]diteur)\s*[:\-]\s*(.+)/i);
    if (m && m[1].trim().length > 2) { fournisseur_name = m[1].trim(); break; }
  }
  if (!fournisseur_name) {
    for (const line of lines.slice(0, 20)) {
      if (/\b(s\.?a\.?r\.?l\.?|s\.?a\.?\b|s\.?a\.?s\.?|e\.?u\.?r\.?l\.?|s\.?n\.?c\.?|auto[\s\-]?entrepreneur|groupe|holding)\b/i.test(line)
        && line.length > 4 && line.length < 80
        && !/facture|devis|bon\s+de|invoice|date|adresse|ice|if\b|rc\b|cnss/i.test(line)) {
        fournisseur_name = line.trim(); break;
      }
    }
  }
  if (!fournisseur_name) {
    for (const line of lines.slice(0, 10)) {
      const stripped = line.replace(/[^a-zA-Z\s]/g, '').trim();
      if (line === line.toUpperCase() && stripped.length > 4 && line.length < 70
        && !/^\d|facture|devis|bon\s+de|invoice|date|adresse|t\.?v\.?a|total|page/i.test(line)) {
        fournisseur_name = line.trim(); break;
      }
    }
  }
  if (!fournisseur_name) {
    for (const line of lines.slice(0, 6)) {
      if (line.length > 5 && line.length < 60
        && !/\d{4}|facture|devis|bon\s+de|invoice|tel|fax|email|www|http/i.test(line)
        && /[A-Za-z]{4}/.test(line)) {
        fournisseur_name = line.trim(); break;
      }
    }
  }

  const result = { total_ht_brut: total_ht, tva_amount, total_ttc, issue_date, ref_fournisseur, fournisseur_name };
  console.log('[OCR] Extracted fields:', JSON.stringify(result));
  return result;
}

// ─── OCR on a file path ───────────────────────────────────────────────────────
async function runOcrOnFile(filePath: string): Promise<{ success: boolean; source: string; data: any; message?: string }> {
  const ext = extname(filePath).toLowerCase();
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(ext);
  const isPdf = ext === '.pdf';

  if (isImage) {
    try {
      const text = execSync(
        `tesseract "${filePath}" stdout -l fra+ara --oem 1 --psm 3 2>/dev/null`,
        { timeout: 30000, encoding: 'utf8' },
      );
      if (!text || text.trim().length < 10) {
        return { success: false, source: 'image', data: {}, message: 'Image illisible — veuillez saisir les montants manuellement' };
      }
      const data = parseInvoiceText(text);
      const hasData = Object.values(data).some(v => v !== null);
      return {
        success: hasData,
        source: 'image-ocr',
        data,
        message: hasData ? 'Informations extraites automatiquement depuis la photo' : 'Photo analysee — certains champs non detectes',
      };
    } catch (err: any) {
      console.error('[OCR] Tesseract error:', err.message);
      return { success: false, source: 'image', data: {}, message: 'Extraction photo echouee — veuillez saisir manuellement' };
    }
  }

  if (!isPdf) {
    return { success: false, source: 'unknown', data: {}, message: 'Format non supporte pour l extraction automatique' };
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    const text = parsed.text || '';
    if (!text || text.trim().length < 10) {
      try {
        const text2 = execSync(
          `tesseract "${filePath}" stdout -l fra+ara --oem 1 --psm 3 2>/dev/null`,
          { timeout: 60000, encoding: 'utf8' },
        );
        if (text2 && text2.trim().length > 10) {
          const data2 = parseInvoiceText(text2);
          const hasData2 = Object.values(data2).some(v => v !== null);
          return { success: hasData2, source: 'pdf-ocr', data: data2 };
        }
      } catch {}
      return { success: false, source: 'pdf', data: {}, message: 'PDF sans texte extractible — saisir manuellement' };
    }
    const data = parseInvoiceText(text);
    const hasData = Object.values(data).some(v => v !== null);
    return { success: hasData, source: 'pdf', data };
  } catch (err: any) {
    console.error('[OCR] pdf-parse error:', err.message);
    return { success: false, source: 'pdf', data: {}, message: 'Extraction echouee — verifier que le PDF contient du texte' };
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────
@ApiTags('upload')
@Controller('upload')
export class UploadController {

  // ── POST /upload ─────────────────────────────────────────────────────────────
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),   // Buffer in RAM — Cloudinary receives it as a stream
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const extOk = /\.(jpeg|jpg|png|gif|webp|svg|pdf)$/i.test(extname(file.originalname));
      const mimeOk = /image\/|application\/pdf|application\/octet-stream/.test(file.mimetype);
      if (extOk || mimeOk) cb(null, true);
      else cb(new Error('Type de fichier non autorise (PDF ou image requis)'), false);
    },
  }))
  async uploadFile(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Aucun fichier recu');

    // ── Cloudinary path ───────────────────────────────────────────────────────
    if (USE_CLOUDINARY) {
      try {
        console.log(`[Upload] → Cloudinary (${file.originalname}, ${file.size} bytes)`);
        const { url, publicId } = await uploadBufferToCloudinary(file.buffer, file.originalname);
        console.log(`[Upload] ✅ Cloudinary URL: ${url}`);
        return {
          url,
          filename: url,      // filename = full URL so extract endpoint works without changes
          publicId,
          originalname: file.originalname,
          size: file.size,
          storage: 'cloudinary',
        };
      } catch (err: any) {
        console.error('[Upload] Cloudinary failed:', err.message);
        throw new InternalServerErrorException(`Erreur Cloudinary: ${err.message}`);
      }
    }

    // ── Local fallback (dev only) ─────────────────────────────────────────────
    const uniqueName = `${crypto.randomBytes(16).toString('hex')}${extname(file.originalname)}`;
    const filePath = join(uploadsPath, uniqueName);
    fs.writeFileSync(filePath, file.buffer);
    console.log(`[Upload] → Local: ${filePath}`);
    return {
      url: `/api/upload/files/${uniqueName}`,
      filename: uniqueName,
      originalname: file.originalname,
      size: file.size,
      storage: 'local',
    };
  }

  // ── GET /upload/extract?filename=<url_or_localname> ───────────────────────
  @Get('extract')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async extractInvoice(@Query('filename') filename: string) {
    if (!filename) throw new BadRequestException('filename requis');

    let filePath: string;
    let isTemp = false;

    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      // Cloudinary URL — download to temp file
      console.log('[OCR] Downloading from Cloudinary:', filename);
      try {
        filePath = await downloadToTmp(filename);
        isTemp = true;
        console.log('[OCR] Downloaded to temp:', filePath);
      } catch (err: any) {
        console.error('[OCR] Download failed:', err.message);
        return { success: false, source: 'error', data: {}, message: 'Impossible de télécharger le fichier pour analyse' };
      }
    } else {
      // Local file (dev / legacy)
      filePath = join(uploadsPath, filename);
      if (!fs.existsSync(filePath)) {
        console.log('[OCR] File not found at:', filePath);
        return { success: false, source: 'error', data: {}, message: `Fichier non trouve: ${filename}` };
      }
    }

    try {
      return await runOcrOnFile(filePath);
    } finally {
      if (isTemp) {
        try { fs.unlinkSync(filePath); } catch {}
      }
    }
  }

  // ── GET /upload/files/:filename (legacy local serve — redirects if needed) ──
  @Get('files/:filename')
  serveFile(
    @Param('filename') filename: string,
    @Query('dl') dl: string,
    @Res() res: Response,
  ) {
    const filePath = join(uploadsPath, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Fichier non trouve (utilise Cloudinary pour les nouveaux fichiers)' });
    }
    if (dl === '1') res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.sendFile(filePath);
  }
}
