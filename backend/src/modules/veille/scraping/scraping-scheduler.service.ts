import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { EntrepriseStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScrapingOrchestratorService } from './scraping-orchestrator.service';

const JOB_PREFIX = 'veille-sync-';
const DEFAULT_CRON = '0 */6 * * *'; // toutes les 6h si aucune fréquence définie

/**
 * Enregistre dynamiquement une tâche cron par entreprise ACTIF, respectant
 * la fréquence propre à chacune (Entreprise.frequence_cron). Une source en
 * échec ou indisponible ne bloque jamais les autres : chaque job tourne
 * indépendamment et les erreurs sont interceptées par l'orchestrateur.
 * Les entreprises A_CONFIGURER/ERREUR/DESACTIVE ne sont pas planifiées tant
 * que leur statut ne repasse pas à ACTIF (manuellement ou via une
 * synchronisation manuelle réussie déclenchée depuis l'admin).
 */
@Injectable()
export class ScrapingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScrapingSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestrator: ScrapingOrchestratorService,
    private readonly registry: SchedulerRegistry,
  ) {}

  async onModuleInit() {
    try {
      const entreprises = await this.prisma.entreprise.findMany({
        where: { status: EntrepriseStatus.ACTIF },
        select: { id: true, nom: true, frequence_cron: true },
      });
      for (const e of entreprises) {
        this.registerJob(e.id, e.nom, e.frequence_cron || DEFAULT_CRON);
      }
      this.logger.log(`${entreprises.length} entreprise(s) ACTIF planifiée(s) pour la veille automatique.`);
    } catch (e: any) {
      // Ne doit jamais empêcher le démarrage du backend (ex: DB indisponible
      // temporairement au boot) — les jobs pourront être resynchronisés via
      // l'endpoint d'administration.
      this.logger.warn(`Initialisation du scheduler de veille reportée: ${e?.message || e}`);
    }
  }

  onModuleDestroy() {
    for (const name of this.registry.getCronJobs().keys()) {
      if (name.startsWith(JOB_PREFIX)) this.registry.deleteCronJob(name);
    }
  }

  /** Ajoute ou remplace le job d'une entreprise (appelé aussi quand
   * l'admin active une entreprise ou change sa fréquence). */
  registerJob(entrepriseId: string, nom: string, cronExpression: string) {
    const jobName = JOB_PREFIX + entrepriseId;
    if (this.registry.doesExist('cron', jobName)) {
      this.registry.deleteCronJob(jobName);
    }
    let job: CronJob;
    try {
      job = CronJob.from({
        cronTime: cronExpression,
        onTick: () => this.runSafely(entrepriseId, nom),
        start: true,
        timeZone: 'Africa/Casablanca',
      });
    } catch {
      this.logger.warn(`Expression cron invalide "${cronExpression}" pour ${nom}, repli sur ${DEFAULT_CRON}`);
      job = CronJob.from({
        cronTime: DEFAULT_CRON,
        onTick: () => this.runSafely(entrepriseId, nom),
        start: true,
        timeZone: 'Africa/Casablanca',
      });
    }
    this.registry.addCronJob(jobName, job as any);
  }

  unregisterJob(entrepriseId: string) {
    const jobName = JOB_PREFIX + entrepriseId;
    if (this.registry.doesExist('cron', jobName)) {
      this.registry.deleteCronJob(jobName);
    }
  }

  private async runSafely(entrepriseId: string, nom: string) {
    try {
      const summary = await this.orchestrator.syncEntreprise(entrepriseId);
      this.logger.log(
        `Sync ${nom}: ${summary.status} — ${summary.annonces_nouvelles} nouvelle(s), ${summary.annonces_maj} maj (${summary.duree_ms}ms)`,
      );
    } catch (e: any) {
      this.logger.error(`Sync ${nom} a échoué de façon inattendue: ${e?.message || e}`);
    }
  }
}
