import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AlertesService {
  constructor(private prisma: PrismaService) {}

  async findAll(params?: { status?: string; type?: string; role?: string }) {
    const where: any = {};
    if (params?.status) where.status = params.status;
    if (params?.type) where.type = params.type;
    if (params?.role) where.target_role = params.role;

    const [data, total] = await Promise.all([
      this.prisma.alert.findMany({
        where, orderBy: { created_at: 'desc' }, take: 100,
      }),
      this.prisma.alert.count({ where }),
    ]);
    return { data, meta: { total } };
  }

  async resolve(id: string, resolvedBy: string, note?: string) {
    return this.prisma.alert.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        resolved_by: resolvedBy,
        resolved_at: new Date(),
        resolution_note: note,
      },
    });
  }

  async acknowledge(id: string) {
    return this.prisma.alert.update({
      where: { id },
      data: { status: 'ACKNOWLEDGED' },
    });
  }

  async getStats() {
    const [open, danger, warn] = await Promise.all([
      this.prisma.alert.count({ where: { status: 'OPEN' } }),
      this.prisma.alert.count({ where: { status: 'OPEN', severity: 'DANGER' } }),
      this.prisma.alert.count({ where: { status: 'OPEN', severity: 'WARN' } }),
    ]);
    return { open, danger, warn };
  }
}
