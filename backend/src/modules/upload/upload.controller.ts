import {
  Controller, Post, UploadedFile, UseInterceptors, UseGuards,
  BadRequestException, Get, Param, Res, Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Response } from 'express';
import * as fs from 'fs';
import { execSync } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require('pdf-parse');

// Ensure uploads directory exists
const uploadsPath = join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });

const storage = diskStorage({
  destination: uploadsPath,
  filename: (_req, file, cb) => {
    const uniqueName = `${crypto.randomBytes(16).toString('hex')}${extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

function parseInvoiceText(text: string): Record<string, any> {
  // Normalize: collapse spaces, unify decimal separators context
  const clean = text.replace(/\r/g, ' ').replace(/[ \t]+/g, ' ');
  const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  console.log('[OCR] Extracted', lines.length, 'lines');
  console.log('[OCR] First 10 lines:', lines.slice(0, 10));

  // Helper to parse a Moroccan/French amount string -> number
  const parseAmount = (s: string): number => {
    if (!s) return 0;
    // Remove spaces used as thousands separators, replace comma with dot
    return parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0;
  };

  // Amount pattern: digits, optional space-separators, comma or dot, 2 decimals
  const AMT = /([\d][\d\s]{0,10}[,.]\d{2})/;

  // --- Search for TTC ---
  let total_ttc: number | null = null;
  for (const line of lines) {
    if (/net\s*[aà]\s*pay[ée]r?|total\s*ttc|montant\s*ttc|total\s*t\.t\.c\.|arrêté|net\s*commercial/i.test(line)) {
      const m = line.match(AMT);
      if (m) { total_ttc = parseAmount(m[1]); break; }
    }
  }

  // --- Search for HT ---
  let total_ht: number | null = null;
  for (const line of lines) {
    if (/(?:total\s*)?(?:h\.?t\.?|hors\s*taxe|montant\s*ht|base\s*ht|sous[- ]total)/i.test(line)) {
      const m = line.match(AMT);
      if (m) { total_ht = parseAmount(m[1]); break; }
    }
  }

  // --- Search for TVA ---
  let tva_amount: number | null = null;
  for (const line of lines) {
    if (/t\.?v\.?a\.?/i.test(line) && !/exon[eé]/i.test(line)) {
      const m = line.match(AMT);
      if (m) { tva_amount = parseAmount(m[1]); break; }
    }
  }

  // --- Fallback: biggest amount = TTC ---
  if (!total_ttc) {
    const allAmounts = [...clean.matchAll(new RegExp(AMT.source, 'g'))]
      .map(m => parseAmount(m[1]))
      .filter(n => n > 10 && n < 10_000_000)
      .sort((a, b) => a - b);
    if (allAmounts.length > 0) total_ttc = allAmounts[allAmounts.length - 1];
  }

  // --- Deduce missing values ---
  if (total_ttc && !total_ht) {
    total_ht = Math.round((total_ttc / 1.2) * 100) / 100;
  }
  if (total_ht && total_ttc && !tva_amount) {
    tva_amount = Math.round((total_ttc - total_ht) * 100) / 100;
  }

  // --- Date ---
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
  // Fallback: any date in text
  if (!issue_date) {
    const m = clean.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (m) {
      let [, d, mo, y] = m;
      issue_date = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
  }

  // --- Reference ---
  let ref_fournisseur: string | null = null;
  for (const line of lines) {
    const m = line.match(/(?:n[o°]?\s*(?:facture|fact\.?)|facture\s*n[o°]?\s*:?|ref(?:erence)?\s*[:.]?)\s*([A-Z0-9][\w\/-]{2,20})/i);
    if (m) { ref_fournisseur = m[1].trim(); break; }
  }

  // --- Fournisseur name ---
  let fournisseur_name: string | null = null;

  // 1. Explicit label: "De:", "Vendeur:", "Fournisseur:", "Société:", "Raison sociale:", "Émetteur:"
  for (const line of lines.slice(0, 25)) {
    const m = line.match(/^(?:de|vendeur|fournisseur|societe|soci[eé]t[eé]|raison\s*sociale|[eé]metteur|exp[eé]diteur)\s*[:\-]\s*(.+)/i);
    if (m && m[1].trim().length > 2) { fournisseur_name = m[1].trim(); break; }
  }

  // 2. Line containing legal form keywords (SARL, SA, SAS, EURL, etc.)
  if (!fournisseur_name) {
    for (const line of lines.slice(0, 20)) {
      if (/\b(s\.?a\.?r\.?l\.?|s\.?a\.?\b|s\.?a\.?s\.?|e\.?u\.?r\.?l\.?|s\.?n\.?c\.?|auto[\s\-]?entrepreneur|groupe|holding)\b/i.test(line)
        && line.length > 4 && line.length < 80
        && !/facture|devis|bon\s+de|invoice|date|adresse|ice|if\b|rc\b|cnss/i.test(line)) {
        fournisseur_name = line.trim(); break;
      }
    }
  }

  // 3. First ALL-CAPS line in header (likely company name), skip very short or number-heavy lines
  if (!fournisseur_name) {
    for (const line of lines.slice(0, 10)) {
      const stripped = line.replace(/[^a-zA-Z\s]/g, '').trim();
      if (line === line.toUpperCase()
        && stripped.length > 4 && line.length < 70
        && !/^\d|facture|devis|bon\s+de|invoice|date|adresse|t\.?v\.?a|total|page/i.test(line)) {
        fournisseur_name = line.trim(); break;
      }
    }
  }

  // 4. Fallback: prominent line in first 5 lines (title-case, no numbers, reasonable length)
  if (!fournisseur_name) {
    for (const line of lines.slice(0, 6)) {
      if (line.length > 5 && line.length < 60
        && !/\d{4}|facture|devis|bon\s+de|invoice|tel|fax|email|www|http/i.test(line)
        && /[A-Za-z]{4}/.test(line)) {
        fournisseur_name = line.trim(); break;
      }
    }
  }

  const result = {
    total_ht_brut: total_ht,
    tva_amount: tva_amount,
    total_ttc: total_ttc,
    issue_date: issue_date,
    ref_fournisseur: ref_fournisseur,
    fournisseur_name: fournisseur_name,
  };
  console.log('[OCR] Extracted fields:', JSON.stringify(result));
  return result;
}

@ApiTags('upload')
@Controller('upload')
export class UploadController {

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', {
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowedExt = /\.(jpeg|jpg|png|gif|webp|pdf)$/i;
      const extOk = allowedExt.test(extname(file.originalname));
      const mimeOk = /image\/|application\/pdf|application\/octet-stream/.test(file.mimetype);
      if (extOk || mimeOk) cb(null, true);
      else cb(new Error('Type de fichier non autorise (PDF ou image requis)'), false);
    },
  }))
  uploadFile(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Aucun fichier recu');
    return {
      url: `/api/upload/files/${file.filename}`,
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
    };
  }

  @Get('extract')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async extractInvoice(@Query('filename') filename: string) {
    if (!filename) throw new BadRequestException('filename requis');

    const filePath = join(uploadsPath, filename);

    console.log('[OCR] Extracting from:', filePath);

    if (!fs.existsSync(filePath)) {
      console.log('[OCR] File not found at:', filePath);
      return { success: false, source: 'error', data: {}, message: `Fichier non trouve: ${filename}` };
    }

    const ext = extname(filename).toLowerCase();
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(ext);
    const isPdf = ext === '.pdf';

    if (isImage) {
      // --- OCR via Tesseract CLI ---
      try {
        console.log('[OCR] Running Tesseract on image:', filePath);
        const text = execSync(
          `tesseract "${filePath}" stdout -l fra+ara --oem 1 --psm 3 2>/dev/null`,
          { timeout: 30000, encoding: 'utf8' },
        );
        console.log('[OCR] Tesseract raw length:', text.length);
        if (!text || text.trim().length < 10) {
          return { success: false, source: 'image', data: {}, message: 'Image illisible — veuillez saisir les montants manuellement' };
        }
        const data = parseInvoiceText(text);
        const hasData = Object.values(data).some(v => v !== null);
        return {
          success: hasData,
          source: 'image-ocr',
          data,
          message: hasData ? 'Informations extraites automatiquement depuis la photo' : 'Photo analysee — certains champs non detectes, veuillez completer',
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
      // Use pdf-parse (pure Node.js — works on Windows & Linux)
      const buffer = fs.readFileSync(filePath);
      const parsed = await pdfParse(buffer);
      const text = parsed.text || '';
      console.log('[OCR] pdf-parse raw length:', text.length);
      if (!text || text.trim().length < 10) {
        // PDF is a scanned image — try tesseract on it
        try {
          console.log('[OCR] PDF has no text, trying Tesseract on PDF pages...');
          const text2 = execSync(
            `tesseract "${filePath}" stdout -l fra+ara --oem 1 --psm 3 2>/dev/null`,
            { timeout: 60000, encoding: 'utf8' },
          );
          if (text2 && text2.trim().length > 10) {
            const data2 = parseInvoiceText(text2);
            const hasData2 = Object.values(data2).some(v => v !== null);
            return { success: hasData2, source: 'pdf-ocr', data: data2, message: hasData2 ? 'Informations extraites (PDF scan)' : 'PDF scan — certains champs non detectes' };
          }
        } catch {}
        return { success: false, source: 'pdf', data: {}, message: 'PDF sans texte extractible (scan image) — saisir manuellement' };
      }
      const data = parseInvoiceText(text);
      const hasData = Object.values(data).some(v => v !== null);
      return { success: hasData, source: 'pdf', data };
    } catch (err: any) {
      console.error('[OCR] pdf-parse error:', err.message);
      return { success: false, source: 'pdf', data: {}, message: 'Extraction echouee — verifier que le PDF contient du texte' };
    }
  }

  @Get('files/:filename')
  serveFile(
    @Param('filename') filename: string,
    @Query('dl') dl: string,
    @Res() res: Response,
  ) {
    const filePath = join(uploadsPath, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'Fichier non trouve' });
    if (dl === '1') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    return res.sendFile(filePath);
  }
}
