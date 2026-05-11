/**
 * Script de création des comptes utilisateurs
 * Usage : npx ts-node seed-users.ts
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const ROUNDS = 10;

  const users = [
    {
      username:   'abdelghni',
      password:   'Etcc2026',
      first_name: 'Abdelghni',
      last_name:  'Employe',
      role:       'EMPLOYE' as const,
    },
    {
      username:   'maherab',
      password:   'Etcc2026',
      first_name: 'Maherab',
      last_name:  'Employe',
      role:       'EMPLOYE' as const,
    },
    {
      username:   'elgharbi',
      password:   'Jihaneapt',
      first_name: 'El Gharbi',
      last_name:  'Gerant',
      role:       'GERANT' as const,
    },
    {
      username:   'idelfinance',
      password:   'Etcc2026',
      first_name: 'Idel',
      last_name:  'Finance',
      role:       'COMPTABLE' as const,
    },
  ];

  for (const u of users) {
    const exists = await prisma.user.findUnique({ where: { username: u.username } });
    if (exists) {
      console.log(`⏭️  ${u.username} existe déjà — ignoré`);
      continue;
    }
    const password_hash = await bcrypt.hash(u.password, ROUNDS);
    await prisma.user.create({
      data: {
        username:           u.username,
        password_hash,
        first_name:         u.first_name,
        last_name:          u.last_name,
        role:               u.role,
        is_active:          true,
        preferred_language: 'FR',
      },
    });
    console.log(`✅  ${u.username} (${u.role}) créé`);
  }

  console.log('\nTerminé.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
