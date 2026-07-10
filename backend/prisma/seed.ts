import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🍯 ETCC — Seeding database...\n');

  // ==================================
  // 1. Société ETCC
  // ==================================
  const company = await prisma.company.upsert({
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
  console.log('✅ Société ETCC créée');

  // ==================================
  // 2. Admin initial
  // ==================================
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Admin2026!';
  const adminHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { password_hash: adminHash }, // ← toujours mettre à jour le mot de passe
    create: {
      username: 'admin',
      email: 'admin@etcc.ma',
      password_hash: adminHash,
      first_name: 'Admin',
      last_name: 'ETCC',
      role: 'ADMIN',
      preferred_language: 'FR',
    },
  });
  console.log(`✅ Admin créé/mis à jour — login: admin / password: ${adminPassword}`);

  // ==================================
  // 3. Gérant
  // ==================================
  const gerantHash = await bcrypt.hash('Youssef2026!', 10);
  const gerant = await prisma.user.upsert({
    where: { username: 'youssef' },
    update: {},
    create: {
      username: 'youssef',
      email: 'youssef@etcc.ma',
      password_hash: gerantHash,
      first_name: 'Youssef',
      last_name: 'Benali',
      role: 'GERANT',
      preferred_language: 'FR',
      created_by: admin.id,
    },
  });
  console.log('✅ Gérant créé — login: youssef / password: Youssef2026!');

  // ==================================
  // 4. Comptable
  // ==================================
  const comptableHash = await bcrypt.hash('Fatima2026!', 10);
  await prisma.user.upsert({
    where: { username: 'fatima' },
    update: {},
    create: {
      username: 'fatima',
      email: 'fatima@etcc.ma',
      password_hash: comptableHash,
      first_name: 'Fatima',
      last_name: 'Alaoui',
      role: 'COMPTABLE',
      preferred_language: 'FR',
      created_by: admin.id,
    },
  });
  console.log('✅ Comptable créée — login: fatima / password: Fatima2026!');

  // ==================================
  // 5. Employés
  // ==================================
  const employeeHash = await bcrypt.hash('Karim2026!', 10);
  const employees = [
    { username: 'karim', first_name: 'Karim', last_name: 'Amrani', phone: '+212 6 12 34 56 78' },
    { username: 'ahmed', first_name: 'Ahmed', last_name: 'Hilali', phone: '+212 6 23 45 67 89' },
    { username: 'rachid', first_name: 'Rachid', last_name: 'Bouzidi', phone: '+212 6 34 56 78 90' },
  ];

  for (const emp of employees) {
    await prisma.user.upsert({
      where: { username: emp.username },
      update: {},
      create: {
        ...emp,
        password_hash: employeeHash,
        role: 'EMPLOYE',
        preferred_language: 'AR',
        created_by: admin.id,
      },
    });
  }
  console.log('✅ 3 Employés créés — password: Karim2026!');

  // ==================================
  // 6. Clients
  // ==================================
  const tazi = await prisma.client.upsert({
    where: { id: 'client-tazi' },
    update: {},
    create: {
      id: 'client-tazi',
      commercial_name: 'M. Mehdi Tazi',
      ice: '003456789000012',
      contact_person: 'Mehdi Tazi',
      phone: '+212 6 11 11 11 11',
      email: 'tazi@gmail.com',
      address: 'Quartier Anfa, Casablanca',
      city: 'Casablanca',
      reliability_score: 85,
    },
  });

  const atlas = await prisma.client.upsert({
    where: { id: 'client-atlas' },
    update: {},
    create: {
      id: 'client-atlas',
      commercial_name: 'Société Atlas SA',
      legal_name: 'Atlas Construction SA',
      ice: '004567890000045',
      rc: '234567',
      contact_person: 'Directeur Technique',
      phone: '+212 5 22 22 22 22',
      email: 'contact@atlas-sa.ma',
      address: 'Zone Industrielle Ain Sebaa, Casablanca',
      city: 'Casablanca',
      reliability_score: 92,
    },
  });
  console.log('✅ 2 Clients créés');

  // ==================================
  // 7. Fournisseurs
  // ==================================
  await prisma.fournisseur.upsert({
    where: { id: 'fourn-bricoma' },
    update: {},
    create: {
      id: 'fourn-bricoma',
      name: 'BRICOMA SARL',
      ice: '005678901000078',
      category: 'Matériaux BTP',
      contact_person: 'M. Hassan',
      phone: '+212 6 55 55 55 55',
      email: 'commercial@bricoma.ma',
      city: 'Casablanca',
      bank_name: 'CIH Bank',
      rib: '230 810 0009876543210987 65',
      iban: 'MA64 2308 1000 0987 6543 2109 8765',
    },
  });
  console.log('✅ 1 Fournisseur créé');

  // ==================================
  // 8. Produits (Stock)
  // ==================================
  const products = [
    { sku: 'SKU-CIM-425', name: 'Ciment 42.5', category: 'Matériaux', unit: 'sacs', quantity: 132, min_threshold: 50, unit_price: 85 },
    { sku: 'SKU-SAB-01', name: 'Sable', category: 'Matériaux', unit: 'm³', quantity: 15, min_threshold: 5, unit_price: 180 },
    { sku: 'SKU-FER-12', name: 'Fer à béton Ø12', category: 'Métallerie', unit: 'barres', quantity: 26, min_threshold: 30, unit_price: 76.30 },
    { sku: 'SKU-PEI-B25', name: 'Peinture blanche 25L', category: 'Finition', unit: 'bidons', quantity: 45, min_threshold: 15, unit_price: 320 },
    { sku: 'SKU-CAR-6060', name: 'Carrelage 60x60', category: 'Finition', unit: 'm²', quantity: 280, min_threshold: 50, unit_price: 145 },
    { sku: 'SKU-PVC-100', name: 'Tube PVC Ø100', category: 'Plomberie', unit: 'tubes', quantity: 22, min_threshold: 15, unit_price: 95 },
  ];

  for (const prod of products) {
    await prisma.product.upsert({
      where: { sku: prod.sku },
      update: {},
      create: prod,
    });
  }
  console.log('✅ 6 Produits créés en stock');

  // ==================================
  // 9. Projet exemple
  // ==================================
  await prisma.project.upsert({
    where: { code: 'ETCC-2026-001' },
    update: {},
    create: {
      code: 'ETCC-2026-001',
      name: 'Villa Anfa — R+2',
      client_id: tazi.id,
      budget_amount: 850000,
      start_date: new Date('2026-03-15'),
      end_date: new Date('2026-12-25'),
      address: 'Quartier Anfa, Casablanca',
      city: 'Casablanca',
      created_by: gerant.id,
    },
  });
  console.log('✅ 1 Projet créé');

  console.log('\n🍯 Seed terminé avec succès !');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Identifiants de connexion :');
  console.log('   👑 Admin     : admin / Admin2026!');
  console.log('   ⭐ Gérant    : youssef / Youssef2026!');
  console.log('   📊 Comptable : fatima / Fatima2026!');
  console.log('   👷 Employé   : karim / Karim2026!');
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
