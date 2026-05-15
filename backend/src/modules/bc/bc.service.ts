import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { BCSource, BCStatus } from '@prisma/client';

@Injectable()
export class BCService {
  constructor(private prisma: PrismaService) {}

  private async generateNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `BC-${year}`;
    const last = await this.prisma.bonCommande.findFirst({
      where: { number: { startsWith: prefix } },
      orderBy: { number: 'desc' },
    });
    let seq = 1;
    if (last) seq = parseInt(last.number.split('-')[2], 10) + 1;
    return `${prefix}-${seq.toString().padStart(4, '0')}`;
  }

  /**
   * Créer un BC depuis un devis validé
   */
  async createFromDevis(devisId: string, createdBy: string, signatureId?: string) {
    const devis = await this.prisma.devis.findUnique({
      where: { id: devisId },
      include: { lines: true },
    });
    if (!devis) throw new NotFoundException('Devis non trouvé');
    if (devis.status !== 'VALIDATED') {
      throw new BadRequestException('Le devis doit être validé pour générer un BC');
    }

    const number = await this.generateNumber();
    // Inherit signature from devis if none explicitly chosen
    const resolvedSigId = signatureId || (devis as any).signature_id || undefined;

    return this.prisma.bonCommande.create({
      data: {
        number,
        source: 'INTERNAL',
        devis_id: devisId,
        client_id: devis.client_id,
        project_id: devis.project_id,
        created_by: createdBy,
        total_ht: devis.total_ht_net,
        total_ttc: devis.total_ttc,
        signature_id: resolvedSigId,
        lines: {
          create: devis.lines.map((l, i) => ({
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            total_ht: l.total_ht,
            order: i,
          })),
        },
      } as any,
      include: { lines: true, client: { select: { commercial_name: true } } },
    });
  }

  /**
   * Importer un BC du client (OCR ou manuel)
   */
  async importBC(data: {
    client_id: string;
    project_id?: string;
    source: BCSource;
    imported_file_url?: string;
    ocr_raw_data?: any;
    signature_id?: string;
    lines: { description: string; quantity: number; unit_price?: number }[];
  }, createdBy: string) {
    const number = await this.generateNumber();

    return this.prisma.bonCommande.create({
      data: {
        number,
        source: data.source,
        client_id: data.client_id,
        project_id: data.project_id,
        created_by: createdBy,
        imported_file_url: data.imported_file_url,
        ocr_raw_data: data.ocr_raw_data,
        signature_id: data.signature_id,
        lines: {
          create: data.lines.map((l, i) => ({
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            total_ht: l.unit_price ? l.quantity * l.unit_price : null,
            order: i,
          })),
        },
      } as any,
      include: { lines: true },
    });
  }

  async findAll(params?: { status?: BCStatus; client_id?: string; search?: string; page?: number; created_by?: string }) {
    const page = params?.page || 1;
    const limit = 50;
    const where: any = {};
    if (params?.created_by) where.created_by = params.created_by;
    if (params?.status) where.status = params.status;
    if (params?.client_id) where.client_id = params.client_id;
    if (params?.search) where.number = { contains: params.search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.bonCommande.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          client: { select: { commercial_name: true } },
          devis: { select: { number: true } },
          _count: { select: { bls: true, invoices: true } },
        },
      }),
      this.prisma.bonCommande.count({ where }),
    ]);
    return { data, meta: { total, page, limit, total_pages: Math.ceil(total / limit) } };
  }

  async findOne(id: string) {
    const bc = await this.prisma.bonCommande.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { order: 'asc' }, include: { product: true } },
        client: true, devis: true, bls: true, invoices: true,
      },
    });
    if (!bc) throw new NotFoundException('BC non trouvé');
    return bc;
  }

  async updateStatus(id: string, status: BCStatus) {
    return this.prisma.bonCommande.update({ where: { id }, data: { status } });
  }

  async cancel(id: string) {
    await this.findOne(id);
    return this.prisma.bonCommande.update({ where: { id }, data: { status: 'CANCELLED' } });
  }
}