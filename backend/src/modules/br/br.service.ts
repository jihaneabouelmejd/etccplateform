import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BRStatus } from '@prisma/client';

@Injectable()
export class BRService {
  constructor(private prisma: PrismaService) {}

  private async generateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `BR-${year}`;
    const last = await this.prisma.bonReception.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
    });
    let seq = 1;
    if (last) seq = parseInt(last.number.split('-')[2], 10) + 1;
    return `${prefix}-${seq.toString().padStart(4, '0')}`;
  }

  /**
   * Réutilise le même numéro de séquence que le BC lié (ex: BC-2026-0089 -> BR-2026-0089).
   * Retombe sur un numéro indépendant en cas de collision.
   */
  private async deriveNumberFromSource(sourceNumber: string): Promise<string> {
    const parts = sourceNumber.split('-');
    if (parts.length >= 3) {
      const year = parts[1];
      const seq = parts[parts.length - 1];
      const candidate = `BR-${year}-${seq}`;
      const exists = await this.prisma.bonReception.findUnique({ where: { number: candidate } });
      if (!exists) return candidate;
    }
    return this.generateNumber();
  }

  /**
   * Importer un BR (upload manuel simple) — toujours lié à un BC déjà présent dans la plateforme.
   */
  async importBR(data: {
    bc_id: string;
    client_id?: string;
    project_id?: string;
    imported_file_url: string;
    reception_date?: string;
    notes?: string;
  }, createdBy: string) {
    if (!data.bc_id) throw new BadRequestException('Un BC lié est obligatoire pour importer un BR');
    if (!data.imported_file_url) throw new BadRequestException('Le fichier du BR est obligatoire');

    const bc = await this.prisma.bonCommande.findUnique({ where: { id: data.bc_id } });
    if (!bc) throw new NotFoundException('BC lié introuvable');
    if (bc.status === 'CANCELLED') throw new BadRequestException('Ce BC a été annulé');

    const resolvedClientId = data.client_id || bc.client_id;
    const resolvedProjectId = data.project_id ?? (bc as any).project_id ?? undefined;

    const number = await this.deriveNumberFromSource(bc.number);

    return this.prisma.bonReception.create({
      data: {
        number,
        bc_id: data.bc_id,
        site: (bc as any).site,
        imported_file_url: data.imported_file_url,
        client_id: resolvedClientId,
        project_id: resolvedProjectId,
        created_by: createdBy,
        reception_date: data.reception_date ? new Date(data.reception_date) : new Date(),
        notes: data.notes,
      } as any,
      include: {
        client: { select: { commercial_name: true } },
        bc: { select: { number: true } },
        project: { select: { name: true } },
      },
    });
  }

  async findAll(params?: { status?: BRStatus; client_id?: string; search?: string; page?: number; limit?: number; created_by?: string; bc_id?: string }) {
    const page = params?.page || 1;
    const limit = Math.min(Number(params?.limit) || 50, 500);
    const where: any = {};
    if (params?.created_by) where.created_by = params.created_by;
    if (params?.status) where.status = params.status;
    if (params?.client_id) where.client_id = params.client_id;
    if (params?.bc_id) where.bc_id = params.bc_id;
    if (params?.search) where.number = { contains: params.search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.bonReception.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { number: 'desc' },
        include: {
          client: { select: { commercial_name: true } },
          bc: { select: { number: true } },
          project: { select: { name: true } },
        },
      }),
      this.prisma.bonReception.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const br = await this.prisma.bonReception.findUnique({
      where: { id },
      include: {
        client: true,
        project: true,
        bc: { select: { id: true, number: true, total_ht: true, total_ttc: true } },
        creator: { select: { first_name: true, last_name: true } },
      } as any,
    });
    if (!br) throw new NotFoundException('BR non trouvé');
    return br;
  }

  async update(id: string, input: { number?: string; reception_date?: string; project_id?: string | null; notes?: string | null }) {
    await this.findOne(id);
    return this.prisma.bonReception.update({
      where: { id },
      data: {
        ...(input.number && { number: input.number }),
        ...(input.reception_date && { reception_date: new Date(input.reception_date) }),
        ...(input.project_id !== undefined && { project_id: input.project_id || null }),
        ...(input.notes !== undefined && { notes: input.notes || null }),
      },
    });
  }

  async cancel(id: string) {
    await this.findOne(id);
    return this.prisma.bonReception.update({ where: { id }, data: { status: 'ANNULE' } });
  }

  async hardDelete(id: string) {
    await this.findOne(id);
    return this.prisma.bonReception.delete({ where: { id } });
  }
}
