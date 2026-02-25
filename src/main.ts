import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // --- MONITOR DE MEMORIA (Añade esto) ---
  if (process.env.NODE_ENV !== 'development') {
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const usedRSS = Math.round(memoryUsage.rss / 1024 / 1024);
      const usedHeap = Math.round(memoryUsage.heapUsed / 1024 / 1024);

      console.log(
        `[Memory Monitor] RSS: ${usedRSS}MB | Heap Used: ${usedHeap}MB`,
      );

      if (usedRSS > 450) {
        logger.warn(
          '⚠️ ALERTA: Memoria crítica cerca del límite de Render (512MB)',
        );
      }
    }, 5000); // Monitorea cada 5 segundos
  }
  // ----------------------------------------

  app.enableCors({
    origin: ['http://localhost:4200', 'https://st-app-rho.vercel.app'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Authorization', 'Content-Type', 'x-company-id'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT) || 3000;

  // Importante: '0.0.0.0' es vital para Render
  await app.listen(port, '0.0.0.0');

  logger.log(`Application is running on: ${port}`);
}

bootstrap();
