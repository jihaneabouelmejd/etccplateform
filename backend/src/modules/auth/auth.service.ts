import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { Role, User } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  /**
   * Valide les credentials de l'utilisateur (username + password)
   */
  async validateUser(username: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Compte désactivé. Contactez l\'administrateur');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    return user;
  }

  /**
   * Génère access token + refresh token après login
   */
  async login(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const accessToken = await this.jwt.signAsync(payload);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        preferred_language: user.preferred_language,
        avatar_url: user.avatar_url,
      },
    };
  }

  /**
   * Génère un refresh token et le sauvegarde en DB (hashé)
   */
  private async generateRefreshToken(userId: string): Promise<string> {
    const token = randomBytes(40).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 jours

    await this.prisma.refreshToken.create({
      data: {
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      },
    });

    return token;
  }

  /**
   * Rafraîchit l'access token via refresh token
   */
  async refreshTokens(refreshToken: string) {
    const tokenHash = createHash('sha256').update(refreshToken).digest('hex');

    const stored = await this.prisma.refreshToken.findFirst({
      where: {
        token_hash: tokenHash,
        expires_at: { gt: new Date() },
        revoked_at: null,
      },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('Refresh token invalide');
    }

    // Rotation : on révoque l'ancien et on en crée un nouveau
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked_at: new Date() },
    });

    return this.login(stored.user);
  }

  /**
   * Déconnexion : révoque tous les refresh tokens
   */
  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  /**
   * Hash un mot de passe (utilisé par l'Admin lors de la création d'un user)
   */
  async hashPassword(password: string): Promise<string> {
    const rounds = parseInt(this.config.get('BCRYPT_ROUNDS') || '10', 10);
    return bcrypt.hash(password, rounds);
  }

  /**
   * Valide la force du mot de passe (rules sécurité)
   */
  validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Le mot de passe doit contenir au moins 8 caractères');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Au moins 1 lettre majuscule');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Au moins 1 lettre minuscule');
    }
    if (!/\d/.test(password)) {
      errors.push('Au moins 1 chiffre');
    }

    const commonPasswords = ['password', 'azerty', '12345678', 'qwerty'];
    if (commonPasswords.includes(password.toLowerCase())) {
      errors.push('Mot de passe trop commun');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Génère un mot de passe aléatoire fort (pour le bouton "Générer")
   */
  generateStrongPassword(length = 12): string {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnpqrstuvwxyz';
    const numbers = '23456789';
    const special = '!@#$%&*';

    const all = uppercase + lowercase + numbers + special;

    // Garantir au moins 1 de chaque type
    let password = '';
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];

    // Remplir le reste
    for (let i = 4; i < length; i++) {
      password += all[Math.floor(Math.random() * all.length)];
    }

    // Mélanger
    return password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');
  }

  /**
   * Reset password par l'Admin (pour les users qui oublient)
   */
  async resetUserPassword(userId: string, newPassword: string): Promise<void> {
    const check = this.validatePasswordStrength(newPassword);
    if (!check.valid) {
      throw new BadRequestException({
        message: 'Mot de passe trop faible',
        errors: check.errors,
      });
    }

    const passwordHash = await this.hashPassword(newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password_hash: passwordHash,
        password_changed_at: new Date(),
      },
    });

    // Révoquer tous les refresh tokens existants
    await this.prisma.refreshToken.updateMany({
      where: { user_id: userId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }
}
