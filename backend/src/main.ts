import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function ensureAdminExists(app: any) {
  try {
    const prisma = app.get(PrismaService);
    const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Admin2026!';
    const adminHash = await bcrypt.hash(adminPassword, 10);

    await prisma.user.upsert({
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
  } catch (e) {
    console.error('⚠️  ensureAdminExists error:', e.message);
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

  // Garantir que l'admin existe toujours au démarrage
  await ensureAdminExists(app);
}

bootstrap();