import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import compression from 'compression';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Compresión gzip
  app.use(compression());

  // Monitor de memoria
  if (process.env.NODE_ENV !== 'development') {
    setInterval(() => {
      const memoryUsage = process.memoryUsage();
      const usedRSS = Math.round(memoryUsage.rss / 1024 / 1024);
      if (usedRSS > 450) {
        logger.warn(
          '⚠️ ALERTA: Memoria crítica cerca del límite de Render (512MB)',
        );
      }
    }, 5000);
  }

  app.enableCors({
    origin: ['http://localhost:4200', 'https://st-app-rho.vercel.app'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'x-company-id',
      'x-user-date',
      'x-user-timezone',
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`Application is running on: ${port}`);
}

bootstrap();
