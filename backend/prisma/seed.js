// @ts-nocheck
'use strict';

/**
 * Seed script — plain JS (no TypeScript compilation needed)
 * Runs in production via: node prisma/seed.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🍯 ETCC — Seeding database...\n');

  // ==================================
  // 1. Société ETCC
  // ==================================
  await prisma.company.upsert({
    where: { ice: '002345678900045' },
    update: {},
    create: {
      commercial_name: 'ETCC',
      legal_name: 'ETCC SARL',
      legal_form: 'SARL',
      capital: 500000,
      ice: '002345678900045',
      rc: '123456',
      if: '48291023',
      cnss: '7896543',
      patente: '65432189',
      address_line: 'Bd Zerktouni, Maarif',
      postal_code: '20100',
      city: 'Casablanca',
      phone: '+212 5 22 00 00 00',
      mobile: '+212 6 00 00 00 00',
      email: 'contact@etcc.ma',
      primary_color: '#F4B315',
      bank_name: 'Attijariwafa Bank',
      rib: '007 780 0001234567890123 45',
      iban: 'MA64 0077 8000 0123 4567 8901 2345',
      swift: 'BCMAMAMC',
    },
  });
  console.log('✅ Société ETCC créée/vérifiée');

  // ==================================
  // 2. Admin — toujours mettre à jour le mot de passe
  // ==================================
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Admin2026!';
  const adminHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { password_hash: adminHash },
    create: {
      username: 'admin',
      email: 'admin@etcc.ma',
      password_hash: adminHash,
      first_name: 'Admin',
      last_name: 'ETCC',
      role: 'ADMIN',
      is_active: true,
      preferred_language: 'FR',
    },
  });
  console.log(`✅ Admin créé/mis à jour — login: admin / password: ${adminPassword}`);

  console.log('\n🍯 Seed terminé avec succès !');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   👑 Admin: admin / ${adminPassword}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
