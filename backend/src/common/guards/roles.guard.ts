import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { REQUIRE_MODULE_KEY, ModuleKey } from '../decorators/require-module.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (requiredRoles.includes(user.role)) {
      return true;
    }

    // Permission override par utilisateur: un EMPLOYE dont la fiche liste
    // ce module dans allowed_modules obtient un accès complet (CRUD) à ce
    // module précis, même si le rôle EMPLOYE n'y a pas droit par défaut.
    const moduleKey = this.reflector.getAllAndOverride<ModuleKey>(REQUIRE_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (
      moduleKey &&
      user.role === Role.EMPLOYE &&
      Array.isArray(user.allowed_modules) &&
      user.allowed_modules.includes(moduleKey)
    ) {
      return true;
    }

    return false;
  }
}
