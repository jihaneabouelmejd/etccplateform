import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
  ) {}

  /**
   * L'Admin crée un utilisateur avec username + password directement
   * Pas d'email d'invitation — les credentials sont transmis manuellement
   */
  async create(dto: CreateUserDto, createdBy: string) {
    // Vérifier unicité username
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: dto.username.toLowerCase() },
    });
    if (existingUsername) {
      throw new ConflictException(`Le nom d'utilisateur "${dto.username}" est déjà pris`);
    }

    // Vérifier unicité email (si fourni)
    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
      });
      if (existingEmail) {
        throw new ConflictException(`L'email "${dto.email}" est déjà utilisé`);
      }
    }

    // Valider la force du password
    const passwordCheck = this.auth.validatePasswordStrength(dto.password);
    if (!passwordCheck.valid) {
      throw new BadRequestException({
        message: 'Mot de passe trop faible',
        errors: passwordCheck.errors,
      });
    }

    // Hasher le password
    const passwordHash = await this.auth.hashPassword(dto.password);

    // Créer l'utilisateur
    const user = await this.prisma.user.create({
      data: {
        username: dto.username.toLowerCase(),
        email: dto.email?.toLowerCase(),
        password_hash: passwordHash,
        first_name: dto.first_name,
        last_name: dto.last_name,
        phone: dto.phone,
        role: dto.role,
        preferred_language: dto.preferred_language || 'FR',
        created_by: createdBy,
      },
      select: {
        id: true,
        username: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        role: true,
        preferred_language: true,
        is_active: true,
        created_at: true,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        user_id: createdBy,
        action: 'CREATE_USER',
        entity_type: 'User',
        entity_id: user.id,
        changes: {
          username: user.username,
          role: user.role,
          created_by_admin: true,
        },
      },
    });

    return {
      user,
      credentials: {
        url: process.env.FRONTEND_URL + '/login',
        username: user.username,
        password: dto.password, // Retourné une seule fois
      },
    };
  }

  async getAssignable() {
    return this.prisma.user.findMany({
      where: { is_active: true },
      select: { id: true, first_name: true, last_name: true, role: true },
      orderBy: [{ role: 'asc' }, { first_name: 'asc' }],
    });
  }

  /**
   * Liste tous les utilisateurs (avec filtres)
   */
  async findAll(params?: {
    role?: string;
    is_active?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params?.role) {
      where.role = params.role;
    }
    if (params?.is_active !== undefined) {
      where.is_active = params.is_active;
    }
    if (params?.search) {
      where.OR = [
        { first_name: { contains: params.search, mode: 'insensitive' } },
        { last_name: { contains: params.search, mode: 'insensitive' } },
        { username: { contains: params.search, mode: 'insensitive' } },
        { email: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          username: true,
          email: true,
          first_name: true,
          last_name: true,
          phone: true,
          role: true,
          preferred_language: true,
          is_active: true,
          last_login_at: true,
          created_at: true,
          avatar_url: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Détail d'un utilisateur
   */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        role: true,
        preferred_language: true,
        is_active: true,
        last_login_at: true,
        password_changed_at: true,
        created_at: true,
        updated_at: true,
        avatar_url: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    return user;
  }

  /**
   * Modifier un utilisateur
   */
  async update(id: string, dto: UpdateUserDto, updatedBy: string) {
    const user = await this.findOne(id);

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.first_name && { first_name: dto.first_name }),
        ...(dto.last_name && { last_name: dto.last_name }),
        ...(dto.email && { email: dto.email.toLowerCase() }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.role && { role: dto.role }),
        ...(dto.preferred_language && { preferred_language: dto.preferred_language }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        first_name: true,
        last_name: true,
        role: true,
        is_active: true,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        user_id: updatedBy,
        action: 'UPDATE_USER',
        entity_type: 'User',
        entity_id: id,
        changes: dto as any,
      },
    });

    return updated;
  }

  /**
   * Désactiver un utilisateur (pas de suppression)
   */
  async deactivate(id: string, deactivatedBy: string) {
    return this.update(id, { is_active: false }, deactivatedBy);
  }

  /**
   * Statistiques users (pour dashboard Admin)
   */
  async getStats() {
    const [total, active, byRole] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { is_active: true } }),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: true,
      }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      by_role: byRole.reduce((acc, item) => {
        acc[item.role] = item._count;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}
