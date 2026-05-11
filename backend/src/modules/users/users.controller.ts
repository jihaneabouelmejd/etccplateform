import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './dto/user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  @Post()
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: 'Créer un utilisateur (Admin définit le password)' })
  create(@Body() dto: CreateUserDto, @CurrentUser('id') adminId: string) {
    return this.users.create(dto, adminId);
  }

  @Get('assignable')
  @ApiOperation({ summary: 'Liste simplifiée des utilisateurs assignables (tous rôles)' })
  getAssignable() {
    return this.users.getAssignable();
  }

  @Get()
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: 'Liste des utilisateurs' })
  findAll(
    @Query('role') role?: string,
    @Query('active') active?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.users.findAll({
      role,
      is_active: active === undefined ? undefined : active === 'true',
      search,
      page,
      limit,
    });
  }

  @Get('stats')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Statistiques utilisateurs' })
  getStats() {
    return this.users.getStats();
  }

  @Get('generate-password')
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: 'Générer un mot de passe fort' })
  generatePassword() {
    const password = this.auth.generateStrongPassword();
    const strength = this.auth.validatePasswordStrength(password);
    return { password, strength };
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: 'Détail utilisateur' })
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.GERANT)
  @ApiOperation({ summary: 'Modifier utilisateur' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.users.update(id, dto, adminId);
  }

  @Post(':id/reset-password')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Réinitialiser le mot de passe (Admin)' })
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.auth.resetUserPassword(id, dto.new_password);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Désactiver un utilisateur' })
  deactivate(@Param('id') id: string, @CurrentUser('id') adminId: string) {
    return this.users.deactivate(id, adminId);
  }
}
