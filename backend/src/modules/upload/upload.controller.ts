import {
  Controller, Post, UploadedFile, UseInterceptors, UseGuards,
  BadRequestException, Get, Param, Res, Query, InternalServerErrorException,
  Logger, OnModuleInit, Headers, Redirect,
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

// ─── Cloudinary ───────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cloudinaryLib = require('cloudinary');
const cloudinary = cloudinaryLib.v2 || cloudinaryLib;

// Trim to avoid Railway whitespace issues
const CLOUD_NAME   = (process.env.CLOUDINARY_CLOUD_NAME  || '').trim();
const CLOUD_KEY    = (process.env.CLOUDINARY_API_KEY     || '').trim();
const CLOUD_SECRET = (process.env.CLOUDINARY_API_SECRET  || '').trim();
const CLOUDINARY_FOLDER = (process.env.CLOUDINARY_FOLDER || 'etcc').trim();

const USE_CLOUDINARY = !!(CLOUD_NAME && CLOUD_KEY && CLOUD_SECRET);

if (USE_CLOUDINARY) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key:    CLOUD_KEY,
    api_secret: CLOUD_SECRET,
    secure:     true,
  });
}

// ─── Local fallback (dev / Railway without env vars) ──────────────────────────
const uploadsPath = process.env.UPLOADS_PATH || join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// ─── Upload buffer → Cloudinary ───────────────────────────────────────────────
function uploadBufferToCloudinary(
  buffer: Buffer,
  originalname: string,
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    const isPdf = /\.pdf$/i.test(originalname);
    const resourceType = isPdf ? 'raw' : 'image';

    // Sanitize original filename — conserver l'extension pour que l'URL soit détectable
    const extMatch = originalname.match(/\.[^/.]+$/);
    const ext      = extMatch ? extMatch[0].toLowerCase() : '';
    const baseName = originalname.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 55);
    // Pour les PDFs (raw): inclure .pdf dans le public_id → URL se termine en .pdf
    // Pour les images: Cloudinary gère le format séparément, on garde le baseName
    const publicId = isPdf ? `${baseName}${ext}` : baseName;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_FOLDER,
        resource_type: resourceType,
        public_id: publicId,
        use_filename: true,
        unique_filename: true, // ajoute suffix unique si doublon
        access_mode: 'public',  // Force public delivery (prevent 401 on future uploads)
        type: 'upload',         // Explicit upload type (not 'authenticated')
      },
      (error: any, result: any) => {
        if (error) {
          console.error('[Cloudinary] upload_stream error:', JSON.stringify(error));
          return reject(new Error(error.message || JSON.stringify(error)));
        }
        if (!result || !result.secure_url) {
          return reject(new Error('Cloudinary returned no URL'));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );

    // Pipe buffer into Cloudinary stream
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
}

// ─── Download URL → temp file (for OCR) ──────────────────────────────────────
async function downloadToTmp(url: string): Promise<string> {
  const urlWithoutQuery = url.split('?')[0];
  let ext = extname(urlWithoutQuery) || '.tmp';
  if (!ext || ext === '.tmp') {
    ext = url.includes('/raw/') ? '.pdf' : '.jpg';
  }
  const tmpPath = join(os.tmpdir(), `ocr_${crypto.randomBytes(8).toString('hex')}${ext}`);
  const httpLib = url.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpPath);
    httpLib.get(url, (response: any) => {
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(tmpPath); });
    }).on('error', (err: any) => {
      fs.unlink(tmpPath, () => {});
      reject(err);
    });
  });
}

// ─── OCR helpers ──────────────────────────────────────────────────────────────
function parseInvoiceText(text: string): Record<string, any> {
  const clean = text.replace(/\r/g, ' ').replace(/[ \t]+/g, ' ');
  const lines = clean.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const parseAmount = (s: string): number =>
    parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0;

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
    const all = [...clean.matchAll(new RegExp(AMT.source, 'g'))]
      .map(m => parseAmount(m[1])).filter(n => n > 10 && n < 10_000_000).sort((a, b) => a - b);
    if (all.length) total_ttc = all[all.length - 1];
  }
  if (total_ttc && !total_ht)   total_ht    = Math.round((total_ttc / 1.2) * 100) / 100;
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
    if (m) { const [, d, mo, y] = m; issue_date = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`; }
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

async function runOcrOnFile(filePath: string) {
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
      return { success: Object.values(data).some(v => v !== null), source: 'image-ocr', data };
    } catch {
      return { success: false, source: 'image', data: {}, message: 'Extraction photo echouee — saisir manuellement' };
    }
  }

  if (!isPdf) return { success: false, source: 'unknown', data: {}, message: 'Format non supporte' };

  try {
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    const text = parsed.text || '';
    if (!text || text.trim().length < 10) {
      try {
        const text2 = execSync(`tesseract "${filePath}" stdout -l fra+ara --oem 1 --psm 3 2>/dev/null`, { timeout: 60000, encoding: 'utf8' });
        if (text2 && text2.trim().length > 10) {
          const data2 = parseInvoiceText(text2);
          return { success: Object.values(data2).some(v => v !== null), source: 'pdf-ocr', data: data2 };
        }
      } catch {}
      return { success: false, source: 'pdf', data: {}, message: 'PDF sans texte extractible — saisir manuellement' };
    }
    const data = parseInvoiceText(text);
    return { success: Object.values(data).some(v => v !== null), source: 'pdf', data };
  } catch (err: any) {
    return { success: false, source: 'pdf', data: {}, message: err.message };
  }
}

// ─── Controller ───────────────────────────────────────────────────────────────
@ApiTags('upload')
@Controller('upload')
export class UploadController implements OnModuleInit {
  private readonly logger = new Logger('UploadController');

  onModuleInit() {
    // Log Cloudinary configuration state at startup — visible in Railway logs
    if (USE_CLOUDINARY) {
      this.logger.log(`✅ Cloudinary ENABLED — cloud: ${CLOUD_NAME}, folder: ${CLOUDINARY_FOLDER}`);
    } else {
      this.logger.warn(`⚠️  Cloudinary DISABLED — missing env vars:`);
      if (!CLOUD_NAME)   this.logger.warn('   → CLOUDINARY_CLOUD_NAME is not set');
      if (!CLOUD_KEY)    this.logger.warn('   → CLOUDINARY_API_KEY is not set');
      if (!CLOUD_SECRET) this.logger.warn('   → CLOUDINARY_API_SECRET is not set');
      this.logger.warn('   Uploads will use LOCAL storage (ephemeral on Railway!)');
    }
  }

  // ── GET /upload/status — diagnostic endpoint ────────────────────────────────
  @Get('status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getStatus() {
    return {
      cloudinary_enabled: USE_CLOUDINARY,
      cloud_name: USE_CLOUDINARY ? CLOUD_NAME : null,
      folder: USE_CLOUDINARY ? CLOUDINARY_FOLDER : null,
      missing_vars: [
        !CLOUD_NAME   ? 'CLOUDINARY_CLOUD_NAME'  : null,
        !CLOUD_KEY    ? 'CLOUDINARY_API_KEY'      : null,
        !CLOUD_SECRET ? 'CLOUDINARY_API_SECRET'   : null,
      ].filter(Boolean),
      storage_mode: USE_CLOUDINARY ? 'cloudinary' : 'local (EPHEMERAL)',
    };
  }

  // ── GET /upload/ping — test real Cloudinary connection ─────────────────────
  @Get('ping')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async pingCloudinary() {
    if (!USE_CLOUDINARY) {
      return { ok: false, reason: 'Cloudinary not configured — env vars missing', missing: [
        !CLOUD_NAME ? 'CLOUDINARY_CLOUD_NAME' : null,
        !CLOUD_KEY  ? 'CLOUDINARY_API_KEY'    : null,
        !CLOUD_SECRET ? 'CLOUDINARY_API_SECRET' : null,
      ].filter(Boolean) };
    }
    try {
      // Test by listing resources (lightweight API call)
      const result = await cloudinary.api.ping();
      return { ok: true, cloudinary_status: result.status, cloud: CLOUD_NAME, folder: CLOUDINARY_FOLDER };
    } catch (err: any) {
      this.logger.error('[Cloudinary] Ping failed:', err.message);
      return { ok: false, reason: err.message, cloud: CLOUD_NAME };
    }
  }

  // ── POST /upload ─────────────────────────────────────────────────────────────
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const extOk  = /\.(jpeg|jpg|png|gif|webp|svg|pdf)$/i.test(extname(file.originalname));
      const mimeOk = /image\/|application\/pdf|application\/octet-stream/.test(file.mimetype);
      if (extOk || mimeOk) cb(null, true);
      else cb(new Error('Type de fichier non autorise (PDF ou image requis)'), false);
    },
  }))
  async uploadFile(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('Aucun fichier recu');
    if (!file.buffer || file.buffer.length === 0) throw new BadRequestException('Fichier vide');

    this.logger.log(`[Upload] ${file.originalname} (${file.size} bytes, ${file.mimetype}) — storage: ${USE_CLOUDINARY ? 'cloudinary' : 'local'}`);

    // ── Cloudinary ─────────────────────────────────────────────────────────
    if (USE_CLOUDINARY) {
      try {
        const { url, publicId } = await uploadBufferToCloudinary(file.buffer, file.originalname);
        this.logger.log(`[Upload] ✅ Cloudinary OK → ${url}`);
        return {
          url,
          filename: url,        // filename = full URL for OCR extract endpoint
          publicId,
          originalname: file.originalname,
          size: file.size,
          storage: 'cloudinary',
        };
      } catch (err: any) {
        this.logger.error(`[Upload] ❌ Cloudinary FAILED: ${err.message}`);
        throw new InternalServerErrorException(`Erreur Cloudinary: ${err.message}`);
      }
    }

    // ── Local fallback (dev only — EPHEMERAL sur Railway!) ────────────────
    const uniqueName = `${crypto.randomBytes(16).toString('hex')}${extname(file.originalname)}`;
    const filePath   = join(uploadsPath, uniqueName);
    fs.writeFileSync(filePath, file.buffer);
    this.logger.warn(`[Upload] ⚠️  LOCAL storage (ephemeral): ${filePath}`);
    // On retourne un chemin relatif /api/upload/files/... — le frontend Next.js
    // dispose d'une route GET proxy qui le redirige vers ce backend.
    return {
      url: `/api/upload/files/${uniqueName}`,
      filename: uniqueName,
      originalname: file.originalname,
      size: file.size,
      storage: 'local',
    };
  }

  // ── GET /upload/extract?filename=<url_or_name> — OCR ─────────────────────
  @Get('extract')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async extractInvoice(@Query('filename') filename: string) {
    if (!filename) throw new BadRequestException('filename requis');

    let filePath: string;
    let isTemp = false;

    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      this.logger.log(`[OCR] Downloading: ${filename}`);
      try {
        filePath = await downloadToTmp(filename);
        isTemp = true;
      } catch (err: any) {
        this.logger.error(`[OCR] Download failed: ${err.message}`);
        return { success: false, source: 'error', data: {}, message: 'Impossible de télécharger le fichier pour analyse' };
      }
    } else {
      filePath = join(uploadsPath, filename);
      if (!fs.existsSync(filePath)) {
        return { success: false, source: 'error', data: {}, message: `Fichier non trouve: ${filename}` };
      }
    }

    try {
      return await runOcrOnFile(filePath);
    } finally {
      if (isTemp) { try { fs.unlinkSync(filePath); } catch {} }
    }
  }

  // ── GET /upload/files/:filename — legacy local serve ──────────────────────
  @Get('files/:filename')
  serveFile(@Param('filename') filename: string, @Query('dl') dl: string, @Res() res: Response) {
    const filePath = join(uploadsPath, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Fichier non trouve' });
    }
    if (dl === '1') res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.sendFile(filePath);
  }

  // ── GET /upload/proxy — stream Cloudinary files via backend ──────────────────
  // Pas de JwtAuthGuard : l'iframe ne peut pas envoyer de token.
  // Sécurité : uniquement Cloudinary URLs acceptées.
  // Approche simple : le backend récupère l'URL Cloudinary directement et la pipe
  // (les fichiers sont uploadés en mode public type:'upload', accessible depuis le serveur)
  @Get('proxy')
  async proxyFile(
    @Query('url') encodedUrl: string,
    @Query('dl') dl: string,
    @Res() res: Response,
  ) {
    if (!encodedUrl) return (res as any).status(400).json({ message: 'url requis' });

    let targetUrl: string;
    try { targetUrl = decodeURIComponent(encodedUrl); } catch { targetUrl = encodedUrl; }

    if (!targetUrl.includes('cloudinary.com')) {
      return (res as any).status(403).json({ message: 'URL non autorisee' });
    }

    const urlPath = targetUrl.split('?')[0];
    const ext = urlPath.split('.').pop()?.toLowerCase() || '';
    const filename = urlPath.split('/').pop() || 'fichier';
    const isRaw = targetUrl.includes('/raw/');
    const isPdfFile = ext === 'pdf' || isRaw;
    const defaultCt = isPdfFile ? 'application/pdf'
      : ['jpg','jpeg'].includes(ext) ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : 'application/octet-stream';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Content-Disposition',
      dl === '1'
        ? `attachment; filename="${encodeURIComponent(filename)}"`
        : `inline; filename="${encodeURIComponent(filename)}"`
    );

    // ── Extract public_id + resource_type from Cloudinary CDN URL ─────────────
    const extractInfo = (url: string): { publicId: string; resourceType: string } | null => {
      // Matches: res.cloudinary.com/{cloud}/{image|video|raw}/{upload|authenticated}[/v123]/{public_id}
      const m = url.match(/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/(?:upload|authenticated)(?:\/v\d+)?\/(.*?)(?:\?|$)/);
      if (!m) return null;
      return { publicId: m[2], resourceType: m[1] };
    };

    // ── Build Cloudinary REST API download URL with manual SHA1 signature ─────
    // Uses api.cloudinary.com — works regardless of CDN delivery restrictions.
    // Signature algorithm: SHA1(sorted_params_string + api_secret)
    const buildApiUrl = (publicId: string, resourceType: string): string | null => {
      if (!USE_CLOUDINARY) return null;
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        // params to sign: sorted alphabetically, joined as key=value&...
        const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}`;
        const signature = require('crypto')
          .createHash('sha1')
          .update(paramsToSign + CLOUD_SECRET)
          .digest('hex');
        const qs = new URLSearchParams({
          public_id: publicId,
          api_key: CLOUD_KEY,
          timestamp: String(timestamp),
          signature,
        });
        const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/download?${qs.toString()}`;
        this.logger.log(`[Proxy] API download URL: ${url.substring(0, 120)}`);
        return url;
      } catch (e: any) {
        this.logger.error(`[Proxy] buildApiUrl error: ${e.message}`);
        return null;
      }
    };

    // ── Stream helper with redirect following (max 5 hops) ───────────────────
    const stream = (fetchUrl: string, hops = 0): Promise<void> => {
      this.logger.log(`[Proxy] Fetching (hop ${hops}): ${fetchUrl.substring(0, 100)}`);
      const https = require('https');
      const http = require('http');
      const lib = fetchUrl.startsWith('https') ? https : http;

      return new Promise<void>((resolve) => {
        const req = lib.get(fetchUrl, (response: any) => {
          const sc = response.statusCode as number;
          this.logger.log(`[Proxy] Status: ${sc}`);

          // ── Follow redirects ────────────────────────────────────────────────
          if ([301, 302, 303, 307, 308].includes(sc) && hops < 5) {
            response.resume();
            const location = response.headers['location'] as string | undefined;
            if (location) {
              stream(location, hops + 1).then(resolve);
              return;
            }
          }

          // ── Error ──────────────────────────────────────────────────────────
          if (sc >= 400) {
            this.logger.error(`[Proxy] Error ${sc} at ${fetchUrl.substring(0, 80)}`);
            if (!res.headersSent) {
              (res as any).status(sc).json({ message: `Fichier non accessible (${sc})` });
            }
            resolve();
            return;
          }

          // ── Stream ─────────────────────────────────────────────────────────
          if (!res.headersSent) {
            res.setHeader('Content-Type', response.headers['content-type'] || defaultCt);
            if (response.headers['content-length']) {
              res.setHeader('Content-Length', response.headers['content-length']);
            }
          }
          response.pipe(res);
          response.on('end', resolve);
          response.on('error', (err: any) => {
            this.logger.error(`[Proxy] Stream error: ${err.message}`);
            resolve();
          });
        });

        req.on('error', (err: any) => {
          this.logger.error(`[Proxy] Request error: ${err.message}`);
          if (!res.headersSent) (res as any).status(500).json({ message: err.message });
          resolve();
        });

        req.setTimeout(20000, () => {
          req.destroy();
          if (!res.headersSent) (res as any).status(504).json({ message: 'Timeout' });
          resolve();
        });
      });
    };

    // ── Strategy: always use Cloudinary REST API with credentials ────────────
    // This bypasses all CDN delivery restrictions (strict mode, authenticated type, etc.)
    const info = extractInfo(targetUrl);
    if (info && USE_CLOUDINARY) {
      const apiUrl = buildApiUrl(info.publicId, info.resourceType);
      if (apiUrl) return stream(apiUrl);
    }

    // Fallback: direct CDN fetch (works if resource is fully public)
    return stream(targetUrl);
  }
}
