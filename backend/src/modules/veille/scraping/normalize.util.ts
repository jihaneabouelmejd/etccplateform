import * as crypto from 'crypto';
import { RawConsultation } from './extractors/extractor.interface';

/**
 * Normalisation "règles + regex" (aucune IA). Nettoie le texte, tente de
 * parser dates/budgets en formats FR/MA courants, et détecte des
 * mots-clés/catégories à partir d'un dictionnaire métier BTP/industrie.
 */

const MONTHS_FR: Record<string, number> = {
  janvier: 0, février: 1, fevrier: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, août: 7, aout: 7, septembre: 8, octobre: 9, novembre: 10, décembre: 11, decembre: 11,
};

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Gros œuvre': ['gros œuvre', 'gros oeuvre', 'terrassement', 'fondation', 'béton armé', 'beton arme', 'maçonnerie', 'maconnerie'],
  'Second œuvre': ['second œuvre', 'second oeuvre', 'plâtrerie', 'platrerie', 'peinture', 'menuiserie', 'carrelage', 'faux plafond', 'étanchéité', 'etancheite'],
  Électricité: ['électricité', 'electricite', 'courant fort', 'courant faible', 'tableau électrique', 'groupe électrogène'],
  Plomberie: ['plomberie', 'sanitaire', 'assainissement', 'vrd', 'canalisation'],
  CVC: ['climatisation', 'cvc', 'chauffage', 'ventilation', 'hvac'],
  'Espaces verts': ['espaces verts', 'paysager', 'arrosage automatique'],
  Sécurité: ['sécurité incendie', 'securite incendie', 'vidéosurveillance', 'videosurveillance', 'contrôle d\'accès', 'controle d\'acces', 'gardiennage'],
  Métallerie: ['métallerie', 'metallerie', 'charpente métallique', 'serrurerie', 'ferronnerie'],
  Fournitures: ['fourniture', 'équipement', 'equipement', 'matériel', 'materiel'],
  Études: ['étude', 'etude', 'ingénierie', 'ingenierie', 'bureau d\'études', 'topographie'],
  Nettoyage: ['nettoyage', 'propreté', 'proprete'],
  Restauration: ['restauration collective', 'traiteur', 'catering'],
};

export function cleanText(value?: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, ' ').replace(/[ ​]/g, ' ').trim();
  return cleaned.length ? cleaned : null;
}

export function parseFrenchDate(value?: string | null): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  // ISO / RFC déjà valide
  const iso = new Date(raw);
  if (!isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(raw)) return iso;

  // dd/mm/yyyy ou dd-mm-yyyy
  const numeric = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (numeric) {
    let [, d, m, y] = numeric;
    if (y.length === 2) y = `20${y}`;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) return date;
  }

  // "12 janvier 2026"
  const literal = raw.toLowerCase().match(/(\d{1,2})\s+([a-zéû]+)\s+(\d{4})/i);
  if (literal) {
    const [, d, monthName, y] = literal;
    const month = MONTHS_FR[monthName];
    if (month !== undefined) {
      const date = new Date(Number(y), month, Number(d));
      if (!isNaN(date.getTime())) return date;
    }
  }

  if (!isNaN(iso.getTime())) return iso;
  return null;
}

export function parseBudget(value?: string | null): { montant: number | null; devise: string | null } {
  if (!value) return { montant: null, devise: null };
  const text = value.replace(/ /g, ' ');
  const devise = /eur|€/i.test(text) ? 'EUR' : /usd|\$/i.test(text) ? 'USD' : /mad|dh|dirham/i.test(text) ? 'MAD' : null;
  const numMatch = text.replace(/[\s.]/g, (m) => (m === '.' ? '.' : '')).match(/[\d\s.,]{2,}/);
  if (!numMatch) return { montant: null, devise };
  // normalise "1 234 567,89" ou "1,234,567.89" -> 1234567.89
  let cleaned = numMatch[0].replace(/\s/g, '');
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  if (hasComma && hasDot) {
    // format FR: point = milliers, virgule = décimales
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    cleaned = cleaned.replace(',', '.');
  }
  const montant = parseFloat(cleaned);
  return { montant: isNaN(montant) ? null : montant, devise };
}

export function extractKeywords(text: string): { keywords: string[]; categorie: string | null } {
  const lower = text.toLowerCase();
  const keywords: string[] = [];
  let categorie: string | null = null;
  for (const [cat, terms] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const term of terms) {
      if (lower.includes(term)) {
        keywords.push(term);
        if (!categorie) categorie = cat;
      }
    }
  }
  return { keywords: [...new Set(keywords)], categorie };
}

/** Empreinte de contenu utilisée pour détecter les mises à jour (pas les
 * doublons — ceux-ci sont gérés par la contrainte unique entreprise+url). */
export function computeContentHash(item: RawConsultation): string {
  const payload = JSON.stringify({
    title: item.title?.trim().toLowerCase(),
    description: item.description?.trim().toLowerCase(),
    budget: item.budget_estimatif,
    date_limite: item.date_limite?.toISOString(),
    ville: item.ville,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function normalizeConsultation(raw: RawConsultation): RawConsultation {
  const title = cleanText(raw.title) || 'Sans titre';
  const description = cleanText(raw.description);
  const combined = `${title} ${description || ''}`;
  const { keywords, categorie } = extractKeywords(combined);
  return {
    ...raw,
    title,
    description,
    ville: cleanText(raw.ville),
    maitre_ouvrage: cleanText(raw.maitre_ouvrage),
    categorie: raw.categorie || categorie,
    keywords: raw.keywords?.length ? raw.keywords : keywords,
  };
}
