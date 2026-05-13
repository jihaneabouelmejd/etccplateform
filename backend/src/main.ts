import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function ensureDefaultUsers(app: any) {
  try {
    const prisma = app.get(PrismaService);

    // Admin
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
    console.log(`✅ Admin prêt — login: admin / password: ${adminPassword}`);

    // Gérant
    const gerantHash = await bcrypt.hash('Youssef2026!', 10);
    await prisma.user.upsert({
      where: { username: 'youssef' },
      update: {},
      create: {
        username: 'youssef',
        email: 'youssef@etcc.ma',
        password_hash: gerantHash,
        first_name: 'Youssef',
        last_name: 'Benali',
        role: 'GERANT',
        is_active: true,
        preferred_language: 'FR',
        created_by: admin.id,
      },
    });

    // Comptable
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
        is_active: true,
        preferred_language: 'FR',
        created_by: admin.id,
      },
    });

    // Employés réels (depuis seed-users.ts)
    const realUsers = [
      { username: 'abdelghni', password: 'Etcc2026', first_name: 'Abdelghni', last_name: 'Employe', role: 'EMPLOYE' as const },
      { username: 'maherab',   password: 'Etcc2026', first_name: 'Maherab',   last_name: 'Employe', role: 'EMPLOYE' as const },
      { username: 'elgharbi',  password: 'Jihaneapt', first_name: 'El Gharbi', last_name: 'Gerant',  role: 'GERANT'  as const },
      { username: 'idelfinance', password: 'Etcc2026', first_name: 'Idel',    last_name: 'Finance',  role: 'COMPTABLE' as const },
      { username: 'karim',     password: 'Karim2026!', first_name: 'Karim',   last_name: 'Amrani',   role: 'EMPLOYE' as const },
      { username: 'ahmed',     password: 'Karim2026!', first_name: 'Ahmed',   last_name: 'Hilali',   role: 'EMPLOYE' as const },
      { username: 'rachid',    password: 'Karim2026!', first_name: 'Rachid',  last_name: 'Bouzidi',  role: 'EMPLOYE' as const },
    ];

    for (const u of realUsers) {
      const hash = await bcrypt.hash(u.password, 10);
      await prisma.user.upsert({
        where: { username: u.username },
        update: {},
        create: {
          username: u.username,
          password_hash: hash,
          first_name: u.first_name,
          last_name: u.last_name,
          role: u.role,
          is_active: true,
          preferred_language: 'FR',
          created_by: admin.id,
        },
      });
    }

    console.log('✅ Tous les utilisateurs prêts');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`   👑 admin      / ${adminPassword}`);
    console.log('   ⭐ youssef    / Youssef2026!');
    console.log('   📊 fatima     / Fatima2026!');
    console.log('   🏗️  elgharbi   / Jihaneapt');
    console.log('   💼 idelfinance / Etcc2026');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (e) {
    console.error('⚠️  ensureDefaultUsers error:', e.message);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(require('express').json({ limit: '20mb' }));
  app.use(require('express').urlencoded({ extended: true, limit: '20mb' }));
  app.use(cookieParser());

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: false,
    transform: true,
  }));

  const config = new DocumentBuilder()
    .setTitle('ETCC API')
    .setDescription('API de la plateforme ETCC')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Backend running on port ${port}`);

  // Garantir que tous les users existent au démarrage
  await ensureDefaultUsers(app);
}

bootstrap();