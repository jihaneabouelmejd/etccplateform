import { Injectable, Logger } from '@nestjs/common';
import { EntrepriseStatus, ScrapeRunStatus, AnnonceStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ExtractorPipelineService } from './extractors/extractor-pipeline.service';
import { normalizeConsultation, computeContentHash } from './normalize.util';
import { diffConsultationFields } from './dedup.util';

export interface SyncSummary {
  entreprise_id: string;
  nom: string;
  status: ScrapeRunStatus;
  extracteur_utilise: string;
  annonces_trouvees: number;
  annonces_nouvelles: number;
  annonces_maj: number;
  duree_ms: number;
  erreur?: string;
}

/**
 * Orchestrateur de synchronisation : appelle le pipeline d'extraction pour
 * une entreprise, normalise/dédoublonne les résultats, met à jour
 * Consultation + ConsultationHistory, puis rafraîchit les statistiques
 * dénormalisées de l'entreprise et journalise un ScrapeLog. Une erreur sur
 * une entreprise n'a aucun impact sur les autres (isolation totale).
 */
@Injectable()
export class ScrapingOrchestratorService {
  private readonly logger = new Logger(ScrapingOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: ExtractorPipelineService,
  ) {}

  async syncEntreprise(entrepriseId: string): Promise<SyncSummary> {
    const started = Date.now();
    const entreprise = await this.prisma.entreprise.findUnique({ where: { id: entrepriseId } });
    if (!entreprise) {
      throw new Error(`Entreprise ${entrepriseId} introuvable`);
    }
    if (entreprise.status === EntrepriseStatus.DESACTIVE) {
      return {
        entreprise_id: entrepriseId,
        nom: entreprise.nom,
        status: ScrapeRunStatus.ECHEC,
        extracteur_utilise: 'AUCUN',
        annonces_trouvees: 0,
        annonces_nouvelles: 0,
        annonces_maj: 0,
        duree_ms: 0,
        erreur: 'Entreprise désactivée — synchronisation ignorée',
      };
    }

    let nouvelles = 0;
    let maj = 0;
    let runStatus: ScrapeRunStatus = ScrapeRunStatus.SUCCES;
    let erreur: string | undefined;
    let extracteurUtilise = 'AUCUN';
    let trouvees = 0;

    try {
      const { result, usedExtractor } = await this.pipeline.run(entreprise);
      extracteurUtilise = usedExtractor;
      trouvees = result.items.length;

      if (!result.matched) {
        runStatus = ScrapeRunStatus.ECHEC;
        erreur = result.error || 'Aucun extracteur n\'a permis de récupérer des annonces';
      } else {
        for (const rawItem of result.items) {
          try {
            const normalized = normalizeConsultation(rawItem);
            const isNew = await this.upsertConsultation(entreprise.id, normalized);
            if (isNew) nouvelles++;
            else maj++;
          } catch (itemErr: any) {
            this.logger.warn(`Échec upsert annonce (${entreprise.nom}): ${itemErr?.message || itemErr}`);
          }
        }
        if (result.error) runStatus = ScrapeRunStatus.PARTIEL;
      }
    } catch (e: any) {
      runStatus = ScrapeRunStatus.ECHEC;
      erreur = e?.message || String(e);
      this.logger.error(`Échec synchronisation ${entreprise.nom}: ${erreur}`);
    }

    const dureeMs = Date.now() - started;

    await this.prisma.scrapeLog.create({
      data: {
        entreprise_id: entreprise.id,
        started_at: new Date(started),
        finished_at: new Date(),
        duration_ms: dureeMs,
        status: runStatus,
        annonces_trouvees: trouvees,
        annonces_nouvelles: nouvelles,
        annonces_maj: maj,
        erreur: erreur || null,
      },
    });

    await this.refreshEntrepriseStats(entreprise.id, runStatus, dureeMs, trouvees);

    return {
      entreprise_id: entreprise.id,
      nom: entreprise.nom,
      status: runStatus,
      extracteur_utilise: extracteurUtilise,
      annonces_trouvees: trouvees,
      annonces_nouvelles: nouvelles,
      annonces_maj: maj,
      duree_ms: dureeMs,
      erreur,
    };
  }

  /** Insère ou met à jour une consultation (unicité entreprise_id+source_url).
   * Retourne true si c'est une nouvelle annonce, false si mise à jour. */
  private async upsertConsultation(entrepriseId: string, item: ReturnType<typeof normalizeConsultation>): Promise<boolean> {
    const contentHash = computeContentHash(item);
    const existing = await this.prisma.consultation.findUnique({
      where: { entreprise_id_source_url: { entreprise_id: entrepriseId, source_url: item.source_url } },
    });

    if (!existing) {
      await this.prisma.consultation.create({
        data: {
          entreprise_id: entrepriseId,
          external_id: item.external_id || null,
          source_url: item.source_url,
          title: item.title,
          description: item.description || null,
          categorie: item.categorie || null,
          secteur: item.secteur || null,
          ville: item.ville || null,
          budget_estimatif: item.budget_estimatif ?? null,
          devise: item.devise || null,
          maitre_ouvrage: item.maitre_ouvrage || null,
          date_publication: item.date_publication || null,
          date_limite: item.date_limite || null,
          keywords: item.keywords || [],
          content_hash: contentHash,
          raw_data: item.raw_data ? (item.raw_data as any) : undefined,
          status: AnnonceStatus.NOUVELLE,
        },
      });
      return true;
    }

    // Doublon exact (aucun changement) : on rafraîchit juste last_seen_at,
    // sans journaliser d'historique inutile.
    if (existing.content_hash === contentHash) {
      await this.prisma.consultation.update({
        where: { id: existing.id },
        data: { last_seen_at: new Date() },
      });
      return false;
    }

    const changes = diffConsultationFields(existing, item);
    if (changes.length) {
      await this.prisma.$transaction([
        ...changes.map((c) =>
          this.prisma.consultationHistory.create({
            data: {
              consultation_id: existing.id,
              champ: c.champ,
              ancienne_valeur: c.ancienne_valeur,
              nouvelle_valeur: c.nouvelle_valeur,
            },
          }),
        ),
        this.prisma.consultation.update({
          where: { id: existing.id },
          data: {
            title: item.title,
            description: item.description ?? existing.description,
            ville: item.ville ?? existing.ville,
            budget_estimatif: item.budget_estimatif ?? existing.budget_estimatif,
            devise: item.devise ?? existing.devise,
            maitre_ouvrage: item.maitre_ouvrage ?? existing.maitre_ouvrage,
            date_limite: item.date_limite ?? existing.date_limite,
            keywords: item.keywords?.length ? item.keywords : existing.keywords,
            content_hash: contentHash,
            last_seen_at: new Date(),
            // une annonce déjà vue/importée qui se met à jour redevient visible
            status: existing.status === AnnonceStatus.IGNOREE ? existing.status : AnnonceStatus.NOUVELLE,
          },
        }),
      ]);
    } else {
      await this.prisma.consultation.update({ where: { id: existing.id }, data: { last_seen_at: new Date() } });
    }
    return false;
  }

  private async refreshEntrepriseStats(entrepriseId: string, runStatus: ScrapeRunStatus, dureeMs: number, count: number) {
    const [totalConsultations, recentLogs, latestConsultation, entreprise] = await Promise.all([
      this.prisma.consultation.count({ where: { entreprise_id: entrepriseId } }),
      this.prisma.scrapeLog.findMany({
        where: { entreprise_id: entrepriseId },
        orderBy: { started_at: 'desc' },
        take: 20,
        select: { status: true },
      }),
      this.prisma.consultation.findFirst({
        where: { entreprise_id: entrepriseId },
        orderBy: { first_seen_at: 'desc' },
        select: { first_seen_at: true },
      }),
      this.prisma.entreprise.findUnique({ where: { id: entrepriseId }, select: { total_erreurs: true, status: true } }),
    ]);

    const successCount = recentLogs.filter((l) => l.status === ScrapeRunStatus.SUCCES).length;
    const tauxReussite = recentLogs.length ? successCount / recentLogs.length : null;

    let nextStatus: EntrepriseStatus = entreprise?.status || EntrepriseStatus.A_CONFIGURER;
    if (nextStatus !== EntrepriseStatus.DESACTIVE) {
      if (runStatus === ScrapeRunStatus.SUCCES || runStatus === ScrapeRunStatus.PARTIEL) {
        nextStatus = EntrepriseStatus.ACTIF;
      } else if (runStatus === ScrapeRunStatus.ECHEC) {
        // n'a jamais rien trouvé -> reste à configurer ; a déjà fonctionné
        // par le passé et échoue maintenant -> erreur signalée à l'admin
        nextStatus = totalConsultations === 0 ? EntrepriseStatus.A_CONFIGURER : EntrepriseStatus.ERREUR;
      }
    }

    await this.prisma.entreprise.update({
      where: { id: entrepriseId },
      data: {
        last_sync_at: new Date(),
        last_sync_status: runStatus,
        last_sync_duration_ms: dureeMs,
        last_sync_count: count,
        total_consultations: totalConsultations,
        total_erreurs: runStatus === ScrapeRunStatus.ECHEC ? (entreprise?.total_erreurs || 0) + 1 : entreprise?.total_erreurs || 0,
        taux_reussite: tauxReussite,
        derniere_consultation_at: latestConsultation?.first_seen_at || undefined,
        status: nextStatus,
      },
    });
  }
}
