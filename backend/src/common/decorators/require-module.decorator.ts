import { SetMetadata } from '@nestjs/common';

/**
 * Clés de module valides pour les permissions fines par utilisateur
 * (User.allowed_modules). Doit rester synchronisé avec le frontend
 * (frontend/src/app/(dashboard)/layout.tsx) et avec les décorateurs
 * @RequireModule(...) posés sur les controllers.
 */
export type ModuleKey =
  | 'devis'
  | 'bc'
  | 'bl'
  | 'invoices'
  | 'depenses'
  | 'comptabilite'
  | 'comptabilite-interne'
  | 'pdf'
  | 'marches-prives'
  | 'veille';

export const REQUIRE_MODULE_KEY = 'requireModule';

/**
 * Marque un controller/route comme appartenant à un "module" pour les besoins
 * du système de permissions fines par utilisateur. Ne remplace PAS @Roles() —
 * s'utilise EN PLUS: @Roles() définit qui a accès par défaut, @RequireModule()
 * permet en plus à un utilisateur EMPLOYE dont allowed_modules contient cette
 * clé d'accéder à la route même si son rôle n'y a normalement pas droit.
 * Voir RolesGuard.
 */
export const RequireModule = (key: ModuleKey) => SetMetadata(REQUIRE_MODULE_KEY, key);
