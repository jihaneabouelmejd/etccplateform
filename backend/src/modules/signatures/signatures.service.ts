import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SignatureType } from '@prisma/client';

@Injectable()
export class SignaturesService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    user_id: string;
    name: string;
    image_url: string;
    type: SignatureType;
    is_default?: boolean;
  }) {
    // Si cette signature est par défaut, enlever le flag des autres
    if (data.is_default) {
      await this.prisma.signature.updateMany({
        where: { user_id: data.user_id, is_default: true },
        data: { is_default: false },
      });
    }

    return this.prisma.signature.create({ data });
  }

  async findAllByUser(userId: string) {
    return this.prisma.signature.findMany({
      where: { user_id: userId },
      orderBy: [{ is_default: 'desc' }, { created_at: 'desc' }],
    });
  }

  async findOne(id: string) {
    const sig = await this.prisma.signature.findUnique({ where: { id } });
    if (!sig) throw new NotFoundException('Signature non trouvée');
    return sig;
  }

  async setDefault(id: string, userId: string) {
    // Enlever l'ancien défaut
    await this.prisma.signature.updateMany({
      where: { user_id: userId, is_default: true },
      data: { is_default: false },
    });

    return this.prisma.signature.update({
      where: { id },
      data: { is_default: true },
    });
  }

  async getDefault(userId: string) {
    return this.prisma.signature.findFirst({
      where: { user_id: userId, is_default: true },
    });
  }

  async delete(id: string, userId: string) {
    const sig = await this.findOne(id);
    if (sig.user_id !== userId) {
      throw new BadRequestException('Vous ne pouvez supprimer que vos propres signatures');
    }
    return this.prisma.signature.delete({ where: { id } });
  }
}
