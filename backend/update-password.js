const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const p = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('Admin2026!', 10);
  await p.user.update({
    where: { username: 'admin' },
    data: { password_hash: hash },
  });
  console.log('✅ Password updated! Login: admin / Admin2026!');
  await p.$disconnect();
}

main().catch(console.error);
