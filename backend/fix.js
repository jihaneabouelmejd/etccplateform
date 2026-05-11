const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

async function fix() {
  const p = new PrismaClient();
  const hash = await bcrypt.hash('Admin2026!', 10);
  await p.user.update({
    where: { username: 'admin' },
    data: { password_hash: hash }
  });
  console.log('Done! Login: admin / Admin2026!');
  await p.$disconnect();
}

fix();