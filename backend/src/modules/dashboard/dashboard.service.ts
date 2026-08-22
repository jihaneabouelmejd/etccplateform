import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Résumé simplifié pour le Dashboard Gérant/Admin.
   * Regroupe : chantiers, prestations, dépenses du mois, tâches importantes,
   * TVA à payer, éléments importants du calendrier.
   */
  async getSummary() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [
      chantiers,
      prestations,
      depensesAgg,
      tachesImportantes,
      tachesEnRetard,
      invoiceTva,
      tachesAgenda,
      objectifsAgenda,
    ] = await Promise.all([
      this.getChantiersStatus(now),
      this.getPrestationsStatus(now),
      this.prisma.expense.aggregate({
        where: { date: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.task.findMany({
        where: { priority: { gte: 2 }, status: { not: 'DONE' } },
        orderBy: [{ due_date: 'asc' }],
        take: 5,
        select: {
          id: true,
          title: true,
          due_date: true,
          priority: true,
          status: true,
          project: { select: { name: true } },
        },
      }),
      this.prisma.task.count({
        where: { due_date: { lt: now }, status: { not: 'DONE' } },
      }),
      this.prisma.invoice.aggregate({
        where: {
          direction: 'ISSUED',
          status: { not: 'CANCELLED' },
          issue_date: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { tva_amount: true },
      }),
      this.prisma.task.findMany({
        where: { due_date: { gte: now, lte: in14Days } },
        orderBy: [{ due_date: 'asc' }],
        take: 6,
        select: { id: true, title: true, due_date: true, priority: true },
      }),
      this.prisma.objectif.findMany({
        where: {
          completed: false,
          end_date: { gte: now, lte: in14Days },
        },
        orderBy: [{ end_date: 'asc' }],
        take: 6,
        select: { id: true, title: true, end_date: true },
      }),
    ]);

    const tvaDeductible = await this.prisma.invoice.aggregate({
      where: {
        direction: 'RECEIVED',
        status: { not: 'CANCELLED' },
        issue_date: { gte: startOfMonth, lte: endOfMonth },
      },
      _sum: { tva_amount: true },
    });

    const tvaCollectee = Number(invoiceTva._sum.tva_amount || 0);
    const tvaDed = Number(tvaDeductible._sum.tva_amount || 0);

    const agendaItems = [
      ...tachesAgenda.map((t) => ({
        type: 'tache' as const,
        id: t.id,
        title: t.title,
        date: t.due_date,
        priority: t.priority,
      })),
      ...objectifsAgenda.map((o) => ({
        type: 'objectif' as const,
        id: o.id,
        title: o.title,
        date: o.end_date,
        priority: null,
      })),
    ]
      .filter((i) => !!i.date)
      .sort((a, b) => new Date(a.date as Date).getTime() - new Date(b.date as Date).getTime())
      .slice(0, 8);

    return {
      chantiers,
      prestations,
      depenses_mois: {
        montant_total: Number(depensesAgg._sum.amount || 0),
        count: depensesAgg._count,
        mois: month,
        annee: year,
      },
      taches_importantes: tachesImportantes.map((t) => ({
        id: t.id,
        title: t.title,
        due_date: t.due_date,
        priority: t.priority,
        status: t.status,
        project_name: t.project?.name || null,
      })),
      taches_en_retard: tachesEnRetard,
      tva: {
        collectee: tvaCollectee,
        deductible: tvaDed,
        a_payer: tvaCollectee - tvaDed,
        mois: month,
        annee: year,
      },
      agenda: agendaItems,
      period: { mois: month, annee: year, generated_at: now },
    };
  }

  /**
   * État des chantiers (Project) réparti en 3 catégories simples :
   * - En cours   : status ACTIVE (déjà démarré) ou LATE
   * - Terminés   : status COMPLETED
   * - En attente : status ACTIVE mais pas encore démarré (pas de start_date
   *                ou start_date dans le futur) — ARCHIVED est exclu du total.
   */
  private async getChantiersStatus(now: Date) {
    const [active, late, completed] = await Promise.all([
      this.prisma.project.findMany({
        where: { status: 'ACTIVE' },
        select: { start_date: true },
      }),
      this.prisma.project.count({ where: { status: 'LATE' } }),
      this.prisma.project.count({ where: { status: 'COMPLETED' } }),
    ]);

    const enAttente = active.filter((p) => !p.start_date || p.start_date > now).length;
    const enCoursActive = active.length - enAttente;

    return {
      en_cours: enCoursActive + late,
      termines: completed,
      en_attente: enAttente,
      total: active.length + late + completed,
    };
  }

  /**
   * État des prestations, même logique 3 catégories :
   * - En cours   : statut EN_COURS déjà démarré (date_debut passée)
   * - Terminés   : statut TERMINEE
   * - En attente : statut EN_COURS mais pas encore démarré
   * (ANNULEE est exclu du total, ce n'est ni en cours ni en attente)
   */
  private async getPrestationsStatus(now: Date) {
    const [enCours, terminees] = await Promise.all([
      this.prisma.prestation.findMany({
        where: { statut: 'EN_COURS' },
        select: { date_debut: true },
      }),
      this.prisma.prestation.count({ where: { statut: 'TERMINEE' } }),
    ]);

    const enAttente = enCours.filter((p) => !p.date_debut || p.date_debut > now).length;
    const enCoursDemarre = enCours.length - enAttente;

    return {
      en_cours: enCoursDemarre,
      termines: terminees,
      en_attente: enAttente,
      total: enCours.length + terminees,
    };
  }
}
