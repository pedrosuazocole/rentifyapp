// scripts/setup.js
// Corre migraciones y crea el usuario admin inicial
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Ejecutando setup inicial...');

  const hash = await bcrypt.hash('Admin1234!', 12);

  const user = await prisma.user.upsert({
    where: { email: 'admin@rentify.hn' },
    update: {},
    create: {
      email: 'admin@rentify.hn',
      passwordHash: hash,
      name: 'Administrador Rentify',
      phone: '+50498765432',
      role: 'ADMIN',
      baseCurrency: 'HNL',
      printPreview: true,
      isActive: true,
    },
  });

  console.log('✅ Admin listo:', user.email);
}

main()
  .catch((e) => { console.error('❌ Error en setup:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
