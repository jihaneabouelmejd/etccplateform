import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DettesService {
  constructor(private prisma: PrismaService) {}

  async findAll(statut?: string) {
    return this.prisma.dette.findMany({
      where: statut ? { statut: statut as any } : undefined,
      include: {
        project: { select: { id:true, name:true, code:true } },
        prestation: { select: { id:true, nom:true } },
        paiements: { orderBy: { date:'desc' } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string) {
    const d = await this.prisma.dette.findUnique({
      where: { id },
      include: {
        project: { select: { id:true, name:true, code:true } },
        prestation: { select: { id:true, nom:true } },
        paiements: { orderBy: { date:'desc' } },
      },
    });
    if (!d) throw new NotFoundException('Dette introuvable');
    return d;
  }

  async create(dto: any) {
    return this.prisma.dette.create({
      data: {
        nom:            dto.nom,
        description:    dto.description,
        montant:        dto.montant,
        date:           dto.date ? new Date(dto.date) : new Date(),
        project_id:     dto.project_id || undefined,
        prestation_id:  dto.prestation_id || undefined,
        prestation_nom: dto.prestation_nom || undefined,
        notes:          dto.notes || undefined,
      },
      include: {
        project: { select: { id:true, name:true, code:true } },
        prestation: { select: { id:true, nom:true } },
        paiements: true,
      },
    });
  }

  async update(id: string, dto: any) {
    await this.findOne(id);
    return this.prisma.dette.update({
      where: { id },
      data: {
        nom:            dto.nom            ?? undefined,
        description:    dto.description    ?? undefined,
        montant:        dto.montant         ?? undefined,
        date:           dto.date ? new Date(dto.date) : undefined,
        project_id:     dto.project_id     !== undefined ? (dto.project_id || null)     : undefined,
        prestation_id:  dto.prestation_id  !== undefined ? (dto.prestation_id || null)  : undefined,
        prestation_nom: dto.prestation_nom !== undefined ? (dto.prestation_nom || null) : undefined,
        notes:          dto.notes          !== undefined ? (dto.notes || null)          : undefined,
      },
      include: {
        project: { select: { id:true, name:true, code:true } },
        prestation: { select: { id:true, nom:true } },
        paiements: { orderBy: { date:'desc' } },
      },
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    return this.prisma.dette.delete({ where: { id } });
  }

  async addPaiement(detteId: string, dto: any, userId?: string) {
    const dette = await this.findOne(detteId);
    const paiement = await this.prisma.paiementDette.create({
      data: {
        dette_id: detteId,
        montant:  dto.montant,
        date:     dto.date ? new Date(dto.date) : new Date(),
        mode:     dto.mode || 'ESPECES',
        notes:    dto.notes || undefined,
      },
    });

    // ── Créer automatiquement une dépense MAIN_OEUVRE ──────────────────────
    if (userId) {
      try {
        await (this.prisma.expense as any).create({
          data: {
            category:          'MAIN_OEUVRE',
            amount:            dto.montant,
            date:              dto.date ? new Date(dto.date) : new Date(),
            description:       `Paiement main d'oeuvre — ${dette.nom}`,
            notes:             dto.notes || null,
            payment_method:    (dto.mode || 'ESPECES') as any,
            project_id:        dette.project_id || null,
            prestation_id:     (dette as any).prestation_id || null,
            prestation_nom:    (dette as any).prestation_nom || null,
            submitted_by:      userId,
            status:            'APPROVED',
            paiement_dette_id: paiement.id,
          },
        });
      } catch (err: any) {
        // Ne pas bloquer le paiement si la dépense échoue
        console.error('[dettes] Erreur création dépense auto:', err?.message);
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // Recalculate montant_paye and statut
    const allPaiements = await this.prisma.paiementDette.findMany({ where: { dette_id: detteId } });
    const totalPaye = allPaiements.reduce((s, p) => s + Number(p.montant), 0);
    const montant   = Number(dette.montant);
    const statut    = totalPaye <= 0 ? 'EN_COURS' : totalPaye >= montant ? 'SOLDEE' : 'PARTIELLE';

    await this.prisma.dette.update({
      where: { id: detteId },
      data: { montant_paye: totalPaye, statut: statut as any },
    });

    return this.findOne(detteId);
  }

  async deletePaiement(detteId: string, paiementId: string) {
    // ── Supprimer la dépense liée avant de supprimer le paiement ────────────
    try {
      await (this.prisma.expense as any).deleteMany({
        where: { paiement_dette_id: paiementId },
      });
    } catch (err: any) {
      console.error('[dettes] Erreur suppression dépense liée:', err?.message);
    }
    // ────────────────────────────────────────────────────────────────────────

    await this.prisma.paiementDette.delete({ where: { id: paiementId } });
    // Recalculate
    const allPaiements = await this.prisma.paiementDette.findMany({ where: { dette_id: detteId } });
    const totalPaye    = allPaiements.reduce((s, p) => s + Number(p.montant), 0);
    const dette        = await this.prisma.dette.findUnique({ where: { id: detteId } });
    if (!dette) return;
    const montant = Number(dette.montant);
    const statut  = totalPaye <= 0 ? 'EN_COURS' : totalPaye >= montant ? 'SOLDEE' : 'PARTIELLE';
    await this.prisma.dette.update({ where: { id: detteId }, data: { montant_paye: totalPaye, statut: statut as any } });
    return this.findOne(detteId);
  }

  async stats() {
    const dettes = await this.prisma.dette.findMany();
    const total       = dettes.reduce((s, d) => s + Number(d.montant), 0);
    const paye        = dettes.reduce((s, d) => s + Number(d.montant_paye), 0);
    const reste       = total - paye;
    const en_cours    = dettes.filter(d => d.statut === 'EN_COURS').length;
    const partielles  = dettes.filter(d => d.statut === 'PARTIELLE').length;
    const soldees     = dettes.filter(d => d.statut === 'SOLDEE').length;
    return { total, paye, reste, en_cours, partielles, soldees, count: dettes.length };
  }
}
