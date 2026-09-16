import {
  Controller, Post, UploadedFile, UseInterceptors, UseGuards,
  BadRequestException, Get, Param, Res, Query, Body, InternalServerErrorException,
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

// ─── Tesseract CLI availability ────────────────────────────────────────────────
// Sur Railway, le binaire `tesseract` n'est PAS installé par défaut par
// Nixpacks (uniquement Node.js) — il doit être ajouté explicitement dans
// backend/nixpacks.toml (nixPkgs). Sans ça, tout OCR échoue silencieusement
// (execSync lève ENOENT, intercepté par un try/catch qui renvoie juste
// "Document illisible"). On vérifie sa présence une fois au démarrage pour
// pouvoir logger un avertissement clair au lieu de laisser l'échec muet.
// Le dossier tessdata/ (téléchargé pendant le build, voir nixpacks.toml) contient
// les modèles fra/ara — sans lui, `-l fra+ara` échoue même si tesseract est présent.
const TESSDATA_DIR = join(process.cwd(), 'tessdata');
const HAS_BUNDLED_TESSDATA = fs.existsSync(join(TESSDATA_DIR, 'fra.traineddata')) && fs.existsSync(join(TESSDATA_DIR, 'ara.traineddata'));
const TESSDATA_FLAG = HAS_BUNDLED_TESSDATA ? ` --tessdata-dir "${TESSDATA_DIR}"` : '';

let TESSERACT_AVAILABLE = false;
try {
  execSync('tesseract --version', { timeout: 5000, stdio: 'ignore' });
  TESSERACT_AVAILABLE = true;
} catch {
  TESSERACT_AVAILABLE = false;
}

// ─── Upload buffer → Cloudinary ───────────────────────────────────────────────
function uploadBufferToCloudinary(
  buffer: Buffer,
  originalname: string,
): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    // IMPORTANT: on n'utilise JAMAIS resource_type 'raw' pour les PDFs. Cloudinary
    // bloque par défaut (401, indépendamment de access_mode: 'public') la livraison
    // directe des fichiers 'raw' de type PDF/ZIP — restriction de sécurité au niveau
    // du compte, activable seulement depuis la console Cloudinary (Settings >
    // Security > "Allow delivery of PDF and ZIP files"), pas via l'API d'upload.
    // On uploade donc les PDFs en resource_type 'image' (supporté nativement par
    // Cloudinary pour les PDF), qui n'est PAS soumis à cette restriction → la
    // livraison marche immédiatement sans toucher aux réglages du compte.
    const resourceType = 'image';

    // Sanitize original filename — conserver l'extension pour que l'URL soit détectable
    const baseName = originalname.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 55);
    // resource_type 'image': Cloudinary ajoute lui-même le format détecté (.pdf)
    // en fin d'URL — pas besoin (et pas souhaitable) de l'inclure dans le public_id.
    const publicId = baseName;

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
// Note: Node's http(s).get() ne suit PAS les redirections 3xx et ne vérifie pas
// le status code — un GET qui reçoit une erreur (401/403/404) ou une redirection
// non suivie écrivait silencieusement le corps de la réponse (souvent une page
// HTML) dans un fichier ".pdf", que pdf-parse échouait ensuite à parser → renvoyait
// null → "Document illisible", même si le fichier original est parfaitement lisible.
// On valide donc explicitement le status code et on suit les redirections nous-mêmes.
async function fetchToTmp(url: string, redirectsLeft = 5): Promise<string> {
  const urlWithoutQuery = url.split('?')[0];
  let ext = extname(urlWithoutQuery) || '.tmp';
  if (!ext || ext === '.tmp') {
    ext = url.includes('/raw/') ? '.pdf' : '.jpg';
  }
  const tmpPath = join(os.tmpdir(), `ocr_${crypto.randomBytes(8).toString('hex')}${ext}`);
  const httpLib = url.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    const req = httpLib.get(url, (response: any) => {
      const status = response.statusCode || 0;

      // Redirection (Cloudinary/CDN peuvent rediriger) — non suivie par défaut par http.get
      if (status >= 300 && status < 400 && response.headers.location && redirectsLeft > 0) {
        response.resume(); // drain pour libérer la socket
        const nextUrl = new URL(response.headers.location, url).toString();
        fetchToTmp(nextUrl, redirectsLeft - 1).then(resolve, reject);
        return;
      }

      if (status < 200 || status >= 300) {
        // On lit un extrait du corps (souvent une page d'erreur HTML/JSON) pour le log,
        // sans l'écrire sur disque.
        let bodySnippet = '';
        response.on('data', (chunk: Buffer) => {
          if (bodySnippet.length < 200) bodySnippet += chunk.toString('utf8', 0, 200);
        });
        response.on('end', () => {
          reject(new Error(`Téléchargement échoué (HTTP ${status}): ${bodySnippet.slice(0, 200)}`));
        });
        response.resume();
        return;
      }

      const file = fs.createWriteStream(tmpPath);
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(tmpPath); });
      file.on('error', (err: any) => {
        fs.unlink(tmpPath, () => {});
        reject(err);
      });
    });
    req.on('error', (err: any) => {
      fs.unlink(tmpPath, () => {});
      reject(err);
    });
  });
}

// ─── Cloudinary: contourner le 401 sur les fichiers 'raw' déjà uploadés ────────
// Cloudinary bloque par défaut la livraison CDN directe des fichiers resource_type
// 'raw' de type PDF/ZIP (401), même avec access_mode:'public' — restriction de
// sécurité au niveau du compte (voir uploadBufferToCloudinary, qui n'uploade plus
// en 'raw' pour cette raison, précisément pour éviter ce problème sur les futurs
// fichiers). Mais les fichiers déjà uploadés AVANT ce correctif restent stockés en
// 'raw' sur Cloudinary et continueront de recevoir un 401 sur l'URL CDN directe.
// On contourne ça via l'API REST signée de Cloudinary (même stratégie déjà
// éprouvée par proxyFile() plus bas dans ce fichier), qui n'est pas soumise à
// cette restriction.
function extractCloudinaryInfo(url: string): { publicId: string; resourceType: string } | null {
  const m = url.match(/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/(?:upload|authenticated)(?:\/v\d+)?\/(.*?)(?:\?|$)/);
  if (!m) return null;
  // Le public_id capturé peut encore être URL-encodé (ex: espaces -> %20) sur les
  // anciens fichiers uploadés avant la sanitization des noms de fichiers. Il faut
  // le décoder ici, sinon URLSearchParams le ré-encode une seconde fois (%20 ->
  // %2520), ce qui casse la signature SHA1 et fait échouer le téléchargement signé.
  let publicId = m[2];
  try { publicId = decodeURIComponent(publicId); } catch { /* garde la valeur brute */ }
  return { publicId, resourceType: m[1] };
}

function buildCloudinarySignedDownloadUrl(publicId: string, resourceType: string): string | null {
  if (!USE_CLOUDINARY) return null;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const type = 'upload';
    const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}&type=${type}`;
    const signature = crypto.createHash('sha1').update(paramsToSign + CLOUD_SECRET).digest('hex');
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

async function downloadToTmp(url: string): Promise<string> {
  // Pour les URLs Cloudinary, on essaie d'abord l'API REST signée (contourne le
  // 401 des anciens fichiers 'raw'). Si ça échoue pour une raison quelconque
  // (identifiants rotés, edge-case de signature...), on retombe sur l'URL CDN
  // directe telle quelle — pour ne pas transformer un cas récupérable en échec.
  if (url.includes('res.cloudinary.com') && USE_CLOUDINARY) {
    const info = extractCloudinaryInfo(url);
    if (info) {
      const signedUrl = buildCloudinarySignedDownloadUrl(info.publicId, info.resourceType);
      if (signedUrl) {
        try {
          return await fetchToTmp(signedUrl);
        } catch (err: any) {
          console.warn(`[OCR] Téléchargement via API Cloudinary signée échoué (${err.message}) — nouvelle tentative via URL directe`);
        }
      }
    }
  }
  return fetchToTmp(url);
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

// ─── Extraction IA des articles (Claude) ──────────────────────────────────────
// Contrairement à `runOcrOnFile` (regex/tesseract, seulement des champs d'en-tête
// pour les factures), ceci extrait les VRAIES lignes d'articles (description,
// quantité, prix unitaire) d'un BC/BL importé en photo/scan, via l'API Anthropic
// (vision native pour images, support document natif pour PDF). Utilise fetch
// natif (Node 20+) plutôt qu'un SDK, pour éviter une dépendance supplémentaire.
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const ANTHROPIC_EXTRACT_MODEL = (process.env.ANTHROPIC_EXTRACT_MODEL || 'claude-sonnet-5').trim();

const EXTRACT_LINES_PROMPT = `Ce document est un bon de commande ou un bon de livraison (le texte peut être en français, arabe ou anglais).
Extrais UNIQUEMENT la liste des articles/lignes de commande — PAS l'en-tête (client, dates, numéros), PAS les lignes de sous-total/total HT/TVA/total TTC/remise.
Réponds STRICTEMENT avec du JSON valide, sans aucun texte ni commentaire autour, exactement dans ce format :
{"lines":[{"description":"Nom de l'article tel qu'écrit sur le document","quantity":1.5,"unit_price":120.5}]}
Règles :
- "quantity" est un nombre. Si illisible ou absent, mets 1.
- "unit_price" est un nombre, ou null si le prix unitaire n'apparaît pas sur le document.
- Une entrée par article distinct, dans l'ordre du document.
- Si aucun article n'est identifiable, réponds {"lines":[]}.`;

async function extractLinesWithClaude(filePath: string): Promise<{ success: boolean; lines: { description: string; quantity: number; unit_price?: number }[]; message?: string }> {
  const ext = extname(filePath).toLowerCase();
  const mimeType =
    ext === '.pdf' ? 'application/pdf' :
    ext === '.png' ? 'image/png' :
    ext === '.webp' ? 'image/webp' :
    (ext === '.jpg' || ext === '.jpeg') ? 'image/jpeg' :
    null;

  if (!mimeType) {
    return { success: false, lines: [], message: "Format non supporté pour l'extraction IA (PDF, JPG, PNG ou WEBP uniquement)" };
  }
  if (!ANTHROPIC_API_KEY) {
    return { success: false, lines: [], message: "Extraction IA non configurée (ANTHROPIC_API_KEY manquante côté serveur)" };
  }

  const buffer = fs.readFileSync(filePath);
  if (buffer.length > 32 * 1024 * 1024) {
    return { success: false, lines: [], message: "Fichier trop volumineux pour l'extraction IA (max 32 Mo)" };
  }

  const base64 = buffer.toString('base64');
  const contentBlock = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } };

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_EXTRACT_MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: EXTRACT_LINES_PROMPT }] }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[AI-Extract] Anthropic API error', res.status, errText.slice(0, 300));
      return { success: false, lines: [], message: `Extraction IA échouée (HTTP ${res.status})` };
    }

    const json: any = await res.json();
    const textOut = ((json.content || []) as any[]).map((c) => c.text || '').join('').trim();
    const match = textOut.match(/\{[\s\S]*\}/);
    if (!match) {
      return { success: false, lines: [], message: 'Réponse IA illisible — saisissez les articles manuellement' };
    }

    let parsed: any;
    try { parsed = JSON.parse(match[0]); } catch {
      return { success: false, lines: [], message: 'Réponse IA mal formée — saisissez les articles manuellement' };
    }

    const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];
    const lines = rawLines
      .filter((l: any) => l && typeof l.description === 'string' && l.description.trim())
      .map((l: any) => ({
        description: String(l.description).trim(),
        quantity: Number(l.quantity) > 0 ? Number(l.quantity) : 1,
        unit_price: l.unit_price != null && !isNaN(Number(l.unit_price)) ? Number(l.unit_price) : undefined,
      }));

    return {
      success: lines.length > 0,
      lines,
      message: lines.length ? undefined : 'Aucun article détecté — vérifiez le document ou saisissez manuellement',
    };
  } catch (err: any) {
    console.error('[AI-Extract] Error:', err.message);
    return { success: false, lines: [], message: 'Extraction IA échouée — saisissez manuellement' };
  }
}

// Extrait le texte brut d'un fichier (image ou PDF) via tesseract / pdf-parse,
// sans en tirer de champs particuliers. Point d'entrée commun réutilisé à la
// fois par runOcrOnFile (champs d'en-tête facture) et extractLinesWithRegex
// (lignes d'articles BC/BL) pour éviter de dupliquer la logique OCR.
// Dernière raison d'échec de getRawOcrText, pour enrichir le message "Document
// illisible" côté API sans avoir besoin de fouiller les logs Railway — précieux
// pour diagnostiquer à distance (cf. bug où un fichier PDF parfaitement lisible
// en local échouait uniquement via le pipeline upload → Cloudinary → download).
let lastOcrDebugReason = '';

async function getRawOcrText(filePath: string): Promise<{ text: string; source: string } | null> {
  const ext = extname(filePath).toLowerCase();
  const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(ext);
  const isPdf = ext === '.pdf';

  if (isImage) {
    if (!TESSERACT_AVAILABLE) { lastOcrDebugReason = 'tesseract indisponible sur le serveur'; return null; }
    try {
      const text = execSync(
        `tesseract "${filePath}" stdout -l fra+ara --oem 1 --psm 3${TESSDATA_FLAG} 2>/dev/null`,
        { timeout: 30000, encoding: 'utf8' },
      );
      if (!text || text.trim().length < 10) { lastOcrDebugReason = 'tesseract n\'a extrait aucun texte exploitable de l\'image'; return null; }
      return { text, source: 'image-ocr' };
    } catch (err: any) {
      lastOcrDebugReason = `tesseract (image) a échoué: ${err.message || err}`;
      console.error('[OCR]', lastOcrDebugReason);
      return null;
    }
  }

  if (!isPdf) { lastOcrDebugReason = `extension de fichier non reconnue comme PDF/image ("${ext || 'aucune'}")`; return null; }

  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (err: any) {
    lastOcrDebugReason = `impossible de lire le fichier téléchargé: ${err.message || err}`;
    return null;
  }

  const magic = buffer.subarray(0, 5).toString('utf8');
  if (magic !== '%PDF-') {
    lastOcrDebugReason = `le contenu téléchargé n'est pas un vrai PDF (en-tête reçu: "${buffer.subarray(0, 40).toString('utf8').replace(/[^\x20-\x7e]/g, '·')}", ${buffer.length} octets) — probablement une erreur de téléchargement (Cloudinary a renvoyé autre chose que le fichier)`;
    console.error('[OCR]', lastOcrDebugReason);
    return null;
  }

  try {
    const parsed = await pdfParse(buffer);
    const text = parsed.text || '';
    if (text && text.trim().length >= 10) return { text, source: 'pdf' };

    if (!TESSERACT_AVAILABLE) { lastOcrDebugReason = 'PDF sans calque texte et tesseract indisponible sur le serveur'; return null; }
    try {
      const text2 = execSync(`tesseract "${filePath}" stdout -l fra+ara --oem 1 --psm 3${TESSDATA_FLAG} 2>/dev/null`, { timeout: 60000, encoding: 'utf8' });
      if (text2 && text2.trim().length > 10) return { text: text2, source: 'pdf-ocr' };
      lastOcrDebugReason = 'PDF sans calque texte, et le fallback tesseract n\'a extrait aucun texte exploitable';
    } catch (err: any) {
      lastOcrDebugReason = `PDF sans calque texte, tesseract (fallback) a échoué: ${err.message || err}`;
      console.error('[OCR]', lastOcrDebugReason);
    }
    return null;
  } catch (err: any) {
    lastOcrDebugReason = `pdf-parse a échoué sur un fichier pourtant identifié comme PDF: ${err.message || err}`;
    console.error('[OCR]', lastOcrDebugReason);
    return null;
  }
}

async function runOcrOnFile(filePath: string) {
  const ocr = await getRawOcrText(filePath);
  if (!ocr) {
    const ext = extname(filePath).toLowerCase();
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?)$/i.test(ext);
    const isPdf = ext === '.pdf';
    if (!isImage && !isPdf) return { success: false, source: 'unknown', data: {}, message: 'Format non supporte' };
    return {
      success: false,
      source: isImage ? 'image' : 'pdf',
      data: {},
      message: isImage ? 'Image illisible — veuillez saisir les montants manuellement' : 'PDF sans texte extractible — saisir manuellement',
    };
  }
  const data = parseInvoiceText(ocr.text);
  return { success: Object.values(data).some(v => v !== null), source: ocr.source, data };
}

// ─── Extraction gratuite (regex/tesseract) des lignes d'articles ───────────────
// Alternative sans API/coût à extractLinesWithClaude : on réutilise le texte brut
// déjà extractible localement (pdf-parse pour PDF avec calque texte, tesseract en
// secours pour images/scans) et on essaie de repérer un tableau d'articles par
// heuristiques plutôt que par une IA externe.
//
// Approche :
//  1) Chercher une ligne d'en-tête de tableau ("désignation ... qté ...", etc.)
//     et la première ligne de pied de tableau (total/TVA/net à payer) pour ne
//     scanner que la zone du tableau si elle est détectable.
//  2) Sur chaque ligne candidate, découper en "colonnes" via les doubles-espaces
//     ou tabulations (pdf-parse et tesseract --psm 3 préservent grossièrement
//     l'alignement des tableaux) ; les colonnes numériques en fin de ligne sont
//     interprétées comme quantité / prix unitaire, le reste comme description.
//
// Limite connue : fonctionne bien sur des BC/BL au format tapé et bien aligné ;
// est nettement moins fiable sur des scans manuscrits, photos de mauvaise
// qualité ou tableaux mal alignés — d'où le message invitant à toujours vérifier
// les lignes pré-remplies avant de valider l'import.
const TABLE_HEADER_ROW = /(?:d[ée]signation|article|libell[ée]|produit)s?.{0,40}(?:qt[ée]|quantit[ée])|(?:qt[ée]|quantit[ée]).{0,40}(?:d[ée]signation|article|libell[ée])/i;
const TABLE_FOOTER_ROW = /total\s*(?:h\.?t\.?|t\.?t\.?c\.?)?|sous[- ]total|net\s*[aà]\s*pay[ée]r?|t\.?v\.?a\.?|arr[êe]t[ée]e?\s+la\s+pr[ée]sente|montant\s*en\s*lettres|remise\s*globale|escompte/i;
const META_ROW = /^(?:client|fournisseur|adresse|t[ée]l(?:\.|[ée]phone)?|fax|ice|if|rc|patente|cnss|date|page|signature|cachet|bon\s+de|n[o°]|r[ée]f[ée]rence|objet|conditions?|mode\s*de\s*paiement|livraison)\s*[:.]/i;
const NUM_COL = /^-?\d+(?:[.,]\d{1,2})?$/;
const TRAILING_NUM = /-?\d{1,3}(?:[ .]\d{3})*(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d{1,2})?/g;

function parseAmountToken(s: string): number {
  return parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0;
}

function parseLineItemsFromText(text: string): { description: string; quantity: number; unit_price?: number }[] {
  const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim());

  // Délimiter la zone du tableau si un en-tête de colonnes est détecté
  let start = 0;
  let end = lines.length;
  const headerIdx = lines.findIndex(l => TABLE_HEADER_ROW.test(l));
  if (headerIdx >= 0) {
    start = headerIdx + 1;
    const footerIdx = lines.findIndex((l, i) => i > headerIdx && TABLE_FOOTER_ROW.test(l));
    if (footerIdx > headerIdx) end = footerIdx;
  }
  const zone = lines.slice(start, end);

  const results: { description: string; quantity: number; unit_price?: number }[] = [];

  for (const line of zone) {
    if (line.length < 3) continue;
    if (META_ROW.test(line) || TABLE_FOOTER_ROW.test(line) || TABLE_HEADER_ROW.test(line)) continue;

    let cols = line.split(/\s{2,}|\t+/).map(c => c.trim()).filter(Boolean);

    if (cols.length < 2) {
      // Pas de colonnes détectables (espacement perdu par l'OCR) : on essaie de
      // repérer des nombres en fin de ligne et de traiter le reste comme description.
      const nums = line.match(TRAILING_NUM);
      if (!nums || nums.length === 0) continue;
      const lastNum = nums[nums.length - 1];
      const idx = line.lastIndexOf(lastNum);
      const descPart = line.slice(0, idx).trim().replace(/[-.:]+$/, '');
      if (descPart.length < 2 || /^\d+$/.test(descPart)) continue;
      cols = nums.length >= 2 ? [descPart, ...nums.slice(-2)] : [descPart, lastNum];
    }

    // Colonnes numériques en partant de la droite
    const numericCols: number[] = [];
    for (let i = cols.length - 1; i >= 0; i--) {
      if (NUM_COL.test(cols[i])) numericCols.unshift(i);
      else break;
    }
    if (numericCols.length === 0) continue;

    const description = cols.slice(0, numericCols[0]).join(' ').trim();
    if (!description || description.length < 2 || /^\d+$/.test(description)) continue;

    const numVals = numericCols.map(i => parseAmountToken(cols[i]));
    let quantity = 1;
    let unit_price: number | undefined;

    if (numVals.length === 1) {
      const raw0 = cols[numericCols[0]];
      if (/^\d+$/.test(raw0) && numVals[0] > 0 && numVals[0] <= 1000) quantity = numVals[0];
      else unit_price = numVals[0];
    } else {
      // 2 colonnes: Qté | Montant(ou PU) — 3+ colonnes: Qté | PU | Montant (on garde les 2 premières)
      quantity = numVals[0] > 0 ? numVals[0] : 1;
      unit_price = numVals[1];
    }

    results.push({ description, quantity, unit_price });
    if (results.length >= 60) break; // garde-fou
  }

  return results;
}

async function extractLinesWithRegex(filePath: string): Promise<{ success: boolean; lines: { description: string; quantity: number; unit_price?: number }[]; message?: string }> {
  const ocr = await getRawOcrText(filePath);
  if (!ocr) {
    const reason = lastOcrDebugReason ? ` [${lastOcrDebugReason}]` : '';
    return {
      success: false,
      lines: [],
      message: `Document illisible (scan de mauvaise qualité ou format non supporté) — saisissez les articles manuellement${reason}`,
    };
  }
  const lines = parseLineItemsFromText(ocr.text);
  return {
    success: lines.length > 0,
    lines,
    message: lines.length ? undefined : "Aucun tableau d'articles détecté automatiquement — vérifiez le document ou saisissez manuellement",
  };
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

    // Log tesseract/OCR availability — sans ce binaire, tout OCR (extraction
    // de factures ET extraction de lignes BC/BL) échoue silencieusement.
    if (TESSERACT_AVAILABLE) {
      this.logger.log(`✅ Tesseract OCR ENABLED${HAS_BUNDLED_TESSDATA ? ' (fra+ara bundled)' : ' (⚠️ pas de tessdata fra/ara — voir nixpacks.toml)'}`);
    } else {
      this.logger.warn('⚠️  Tesseract OCR DISABLED — binaire "tesseract" introuvable sur ce serveur.');
      this.logger.warn('   → L\'OCR image/scan (factures ET extraction de lignes BC/BL) ne fonctionnera pas.');
      this.logger.warn('   → Ajouter "tesseract" à nixPkgs dans backend/nixpacks.toml et redéployer.');
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

  // ── GET /upload/ocr-status — diagnostic endpoint (pas de guard : aucune donnée
  // sensible, juste des booléens utiles pour déboguer "Document illisible" sans
  // avoir besoin d'un token ni de fouiller les logs Railway) ──────────────────
  @Get('ocr-status')
  getOcrStatus() {
    let version: string | null = null;
    if (TESSERACT_AVAILABLE) {
      try { version = execSync('tesseract --version', { timeout: 5000, encoding: 'utf8' }).split('\n')[0]; } catch {}
    }
    return {
      tesseract_available: TESSERACT_AVAILABLE,
      tesseract_version: version,
      bundled_tessdata_dir: TESSDATA_DIR,
      bundled_fra: fs.existsSync(join(TESSDATA_DIR, 'fra.traineddata')),
      bundled_ara: fs.existsSync(join(TESSDATA_DIR, 'ara.traineddata')),
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

  // ── POST /upload/delete — best-effort cleanup of a previously uploaded file ──
  // Used when a file is replaced (e.g. "Remplacer" on a BC) so the old asset
  // doesn't linger forever on Cloudinary / local disk. Never throws — a failed
  // cleanup shouldn't block the caller, it's just housekeeping.
  @Post('delete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async deleteFile(@Body('url') url: string) {
    if (!url) return { ok: false, reason: 'url manquante' };
    try {
      if (USE_CLOUDINARY && url.includes('cloudinary.com')) {
        const m = url.match(/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/(?:upload|authenticated)(?:\/v\d+)?\/(.*?)(?:\?|$)/);
        if (!m) return { ok: false, reason: 'URL Cloudinary non reconnue' };
        const resourceType = m[1];
        // Pour raw (PDFs), le public_id inclut l'extension (voir uploadBufferToCloudinary).
        // Pour image/video, l'extension visible dans l'URL est le format de livraison,
        // pas le public_id — il faut la retirer avant d'appeler destroy().
        const publicId = resourceType === 'raw' ? m[2] : m[2].replace(/\.[a-zA-Z0-9]+$/, '');
        const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: 'upload' });
        this.logger.log(`[Delete] Cloudinary destroy(${publicId}, ${resourceType}) → ${JSON.stringify(result)}`);
        return { ok: result?.result === 'ok' || result?.result === 'not found', detail: result?.result };
      }
      // Local fallback: url looks like /api/upload/files/<name> or /upload/files/<name>
      const filename = url.split('/').pop();
      if (filename) {
        const filePath = join(uploadsPath, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          return { ok: true };
        }
      }
      return { ok: false, reason: 'Fichier local introuvable' };
    } catch (err: any) {
      this.logger.error(`[Delete] Failed: ${err.message}`);
      return { ok: false, reason: err.message };
    }
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

  // ── GET /upload/extract-lines?filename=<url> — extraction des articles ──────
  // Contrairement à /upload/extract (champs d'en-tête facture via regex), ceci
  // renvoie les vraies lignes d'articles (description/quantité/prix) d'un BC/BL
  // importé. Utilisé par les modales d'import BC/BL pour pré-remplir le tableau
  // de lignes au lieu de laisser un nom de fichier en guise de description.
  //
  // Stratégie : extraction locale gratuite par regex/tesseract en priorité (pas
  // de coût, pas de clé API requise). Si elle ne trouve rien ET qu'une clé
  // ANTHROPIC_API_KEY est configurée côté serveur, on tente Claude en secours —
  // mais ce n'est jamais une dépendance obligatoire.
  @Get('extract-lines')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async extractLines(@Query('filename') filename: string) {
    if (!filename) throw new BadRequestException('filename requis');

    let filePath: string;
    let isTemp = false;

    if (filename.startsWith('http://') || filename.startsWith('https://')) {
      this.logger.log(`[Extract-Lines] Downloading: ${filename}`);
      try {
        filePath = await downloadToTmp(filename);
        isTemp = true;
      } catch (err: any) {
        this.logger.error(`[Extract-Lines] Download failed: ${err.message}`);
        return { success: false, lines: [], message: `Impossible de télécharger le fichier pour analyse [${err.message}]` };
      }
    } else {
      filePath = join(uploadsPath, filename);
      if (!fs.existsSync(filePath)) {
        return { success: false, lines: [], message: `Fichier non trouve: ${filename}` };
      }
    }

    try {
      const regexResult = await extractLinesWithRegex(filePath);
      if (regexResult.success) return regexResult;

      if (ANTHROPIC_API_KEY) {
        const aiResult = await extractLinesWithClaude(filePath);
        if (aiResult.success) return aiResult;
      }

      return regexResult;
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
      // Décoder le public_id capturé (peut contenir des %20 etc. sur les anciens
      // fichiers) pour éviter un double encodage lors de la signature SHA1 — voir
      // extractCloudinaryInfo() plus haut dans ce fichier pour le détail du bug.
      let publicId = m[2];
      try { publicId = decodeURIComponent(publicId); } catch { /* garde la valeur brute */ }
      return { publicId, resourceType: m[1] };
    };

    // ── Build Cloudinary REST API download URL with manual SHA1 signature ─────
    // Uses api.cloudinary.com — works regardless of CDN delivery restrictions.
    // Signature algorithm: SHA1(sorted_params_string + api_secret)
    //
    // IMPORTANT: Cloudinary's /download endpoint defaults the `type` param to
    // "private" when it's absent from the signed request. All files uploaded by
    // this app use `type: 'upload'` (see uploadBufferToCloudinary), so omitting
    // `type` here made every download lookup search for a "private" resource
    // that doesn't exist → 404, even though the file is really on Cloudinary
    // (confirmed: direct CDN fetch returns 401 "restricted", not 404 "missing").
    // Explicitly signing type=upload fixes the mismatch.
    const buildApiUrl = (publicId: string, resourceType: string): string | null => {
      if (!USE_CLOUDINARY) return null;
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        const type = 'upload';
        // params to sign: sorted alphabetically, joined as key=value&...
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
        const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/download?${qs.toString()}`;
        this.logger.log(`[Proxy] API download — public_id="${publicId}" resource_type=${resourceType} type=${type}`);
        return url;
      } catch (e: any) {
        this.logger.error(`[Proxy] buildApiUrl error: ${e.message}`);
        return null;
      }
    };

    // ── Stream helper with redirect following (max 5 hops) ───────────────────
    // isFinal=false → on error, do NOT write to the client; just resolve with the
    // status code so the caller can retry a different URL (e.g. fallback to the
    // direct CDN URL if the signed API download fails).
    // isFinal=true  → on error, this is the last resort: write the error JSON.
    const stream = (fetchUrl: string, isFinal: boolean, hops = 0): Promise<number | 'ok'> => {
      this.logger.log(`[Proxy] Fetching (hop ${hops}, final=${isFinal}): ${fetchUrl.substring(0, 100)}`);
      const https = require('https');
      const http = require('http');
      const lib = fetchUrl.startsWith('https') ? https : http;

      return new Promise<number | 'ok'>((resolve) => {
        const req = lib.get(fetchUrl, (response: any) => {
          const sc = response.statusCode as number;
          this.logger.log(`[Proxy] Status: ${sc}`);

          // ── Follow redirects ────────────────────────────────────────────────
          if ([301, 302, 303, 307, 308].includes(sc) && hops < 5) {
            response.resume();
            const location = response.headers['location'] as string | undefined;
            if (location) {
              stream(location, isFinal, hops + 1).then(resolve);
              return;
            }
          }

          // ── Error ──────────────────────────────────────────────────────────
          // On lit le corps de la réponse d'erreur (Cloudinary renvoie un JSON
          // avec le vrai motif : "Invalid Signature", "Resource not found", etc.)
          // pour pouvoir diagnostiquer sans accès aux logs serveur.
          if (sc >= 400) {
            let errBody = '';
            response.on('data', (chunk: any) => { if (errBody.length < 2000) errBody += chunk.toString(); });
            response.on('end', () => {
              this.logger.error(`[Proxy] Error ${sc} at ${fetchUrl.substring(0, 100)} — body: ${errBody.substring(0, 500)}`);
              if (isFinal && !res.headersSent) {
                (res as any).status(sc).json({
                  message: `Fichier non accessible (${sc})`,
                  detail: errBody.substring(0, 500) || undefined,
                });
              }
              resolve(sc);
            });
            response.on('error', () => resolve(sc));
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
          response.on('end', () => resolve('ok'));
          response.on('error', (err: any) => {
            this.logger.error(`[Proxy] Stream error: ${err.message}`);
            resolve('ok'); // headers already sent — nothing more we can do
          });
        });

        req.on('error', (err: any) => {
          this.logger.error(`[Proxy] Request error: ${err.message}`);
          if (isFinal && !res.headersSent) (res as any).status(500).json({ message: err.message });
          resolve(500);
        });

        req.setTimeout(20000, () => {
          req.destroy();
          if (isFinal && !res.headersSent) (res as any).status(504).json({ message: 'Timeout' });
          resolve(504);
        });
      });
    };

    // ── Strategy: try the signed Cloudinary REST API first (bypasses CDN
    // delivery restrictions like strict mode / authenticated type). If that
    // fails for any reason (stale/rotated Cloudinary credentials, signature
    // edge-case, etc.), fall back to the direct CDN URL instead of giving up —
    // this was previously an all-or-nothing attempt with no fallback, which
    // could turn a recoverable failure into a permanent "Fichier non accessible".
    const info = extractInfo(targetUrl);
    if (info && USE_CLOUDINARY) {
      const apiUrl = buildApiUrl(info.publicId, info.resourceType);
      if (apiUrl) {
        const result = await stream(apiUrl, false);
        if (result === 'ok') return;
        this.logger.warn(`[Proxy] Signed API download failed (${result}) — retrying via direct CDN URL`);
      }
    }

    // Fallback: direct CDN fetch (works if resource is fully public)
    await stream(targetUrl, true);
  }
}
