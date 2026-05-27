// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de Rentify App...');

  const adminPassword = await bcrypt.hash('Admin1234!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@rentify.hn' },
    update: {},
    create: {
      email: 'admin@rentify.hn',
      passwordHash: adminPassword,
      name: 'Administrador Rentify',
      phone: '+50498765432',
      role: 'ADMIN',
      baseCurrency: 'HNL',
    },
  });
  console.log(`✅ Admin: ${admin.email} / Admin1234!`);

  const property = await prisma.property.upsert({
    where: { id: 'prop-seed-001' },
    update: {},
    create: {
      id: 'prop-seed-001',
      ownerId: admin.id,
      name: 'Residencial Las Palmas',
      address: 'Col. Kennedy, Calle Principal #45',
      city: 'Tegucigalpa',
      department: 'Francisco Morazán',
      description: 'Residencial de 6 apartamentos para pruebas',
    },
  });
  console.log(`✅ Propiedad: ${property.name}`);

  const unit = await prisma.unit.upsert({
    where: { propertyId_number: { propertyId: property.id, number: 'Apto 1A' } },
    update: {},
    create: {
      propertyId: property.id,
      number: 'Apto 1A',
      floor: 1,
      bedrooms: 2,
      bathrooms: 1,
      squareMeters: 65.5,
    },
  });
  console.log(`✅ Unidad: ${unit.number}`);

  const tenant = await prisma.tenant.upsert({
    where: { email: 'inquilino@prueba.hn' },
    update: {},
    create: {
      firstName: 'Juan',
      lastName: 'Martínez',
      email: 'inquilino@prueba.hn',
      phone: '+50499887766',
      nationalId: '0801199900001',
    },
  });
  console.log(`✅ Inquilino: ${tenant.firstName} ${tenant.lastName}`);

  // Tipo de cambio de prueba
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await prisma.exchangeRate.upsert({
    where: { date: today },
    update: {},
    create: {
      date: today,
      rate: 24.89,
      source: 'seed-data',
    },
  });
  console.log('✅ Tipo de cambio de prueba: L 24.89 por USD');

  console.log('\n🎉 Seed completado. Podés iniciar sesión con:');
  console.log('   Email: admin@rentify.hn');
  console.log('   Contraseña: Admin1234!\n');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
