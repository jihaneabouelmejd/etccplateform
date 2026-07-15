const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const bls = await prisma.bonLivraison.findMany({
      where: { source: { not: 'INTERNAL' } },
      select: { id: true, number: true, source: true, status: true, imported_file_url: true, created_by: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
    console.log('=== BL imported (source != INTERNAL) ===');
    console.log(JSON.stringify(bls, null, 2));

    const bcs = await prisma.bonCommande.findMany({
      where: { source: { not: 'INTERNAL' } },
      select: { id: true, number: true, source: true, status: true, imported_file_url: true, created_by: true, created_at: true },
      orderBy: { created_at: 'desc' },
      take: 20,
    });
    console.log('=== BC imported (source != INTERNAL) ===');
    console.log(JSON.stringify(bcs, null, 2));

    const totalBl = await prisma.bonLivraison.count();
    const totalBc = await prisma.bonCommande.count();
    console.log('Total BL:', totalBl, 'Total BC:', totalBc);
  } catch (e) {
    console.error('ERROR', e);
  } finally {
    await prisma.$disconnect();
  }
})();
