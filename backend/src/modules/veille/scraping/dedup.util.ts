import { Consultation } from '@prisma/client';
import { RawConsultation } from './extractors/extractor.interface';

/** Champs suivis dans l'historique des modifications d'une consultation. */
const TRACKED_FIELDS = ['title', 'description', 'budget_estimatif', 'date_limite', 'ville', 'maitre_ouvrage'] as const;

export interface FieldChange {
  champ: string;
  ancienne_valeur: string | null;
  nouvelle_valeur: string | null;
}

function toComparable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Compare une consultation existante avec les données fraîchement extraites
 * et retourne la liste des champs qui ont réellement changé (pour journaliser
 * l'historique des modifications sans bruit). */
export function diffConsultationFields(existing: Consultation, incoming: RawConsultation): FieldChange[] {
  const changes: FieldChange[] = [];
  const incomingMap: Record<string, unknown> = {
    title: incoming.title,
    description: incoming.description,
    budget_estimatif: incoming.budget_estimatif,
    date_limite: incoming.date_limite,
    ville: incoming.ville,
    maitre_ouvrage: incoming.maitre_ouvrage,
  };

  for (const field of TRACKED_FIELDS) {
    const before = toComparable((existing as any)[field]);
    const after = toComparable(incomingMap[field]);
    // on n'écrase / ne journalise pas si la nouvelle valeur est vide alors
    // qu'une valeur existait déjà (évite de perdre de l'info sur un extrait
    // partiel)
    if (after === null || after === '') continue;
    if (before !== after) {
      changes.push({ champ: field, ancienne_valeur: before, nouvelle_valeur: after });
    }
  }
  return changes;
}
