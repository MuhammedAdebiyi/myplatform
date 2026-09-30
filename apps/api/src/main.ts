import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadEnv } from '@myplatform/config';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS restricted to the web app origin (the only legitimate browser
  // client). Same-server API routes (OAuth callbacks, webhooks) are
  // same-origin/server-to-server and unaffected.
  const webOrigin = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  app.enableCors({
    origin: env.NODE_ENV === 'production' ? webOrigin : [webOrigin, 'http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  console.log(`api listening on :${port} (${env.NODE_ENV})`);
}
bootstrap();
