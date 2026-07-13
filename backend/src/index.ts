import 'reflect-metadata';
import killPort from 'kill-port';
import { setTimeout as delay } from 'node:timers/promises';
import type { Express } from 'express';
import type { Server } from 'http';
import type { DataSource } from 'typeorm';
import { createExamPortalDataSource } from './database/data-source';
import { createStudentDataSource } from './database/student-data-source';
import {
  connectHrmsMongo,
  disconnectHrmsMongo,
} from './auth/hrms-user.model';
import { createServices } from './database/container';
import { createApp } from './app';
import { config } from './config';

let server: Server | null = null;
let examPortalDataSource: DataSource | null = null;
let studentDataSource: DataSource | null = null;
let shuttingDown = false;

async function freeDevPort(port: number) {
  if (process.env.NODE_ENV === 'production') return;

  try {
    await killPort(port, 'tcp');
  } catch {
    // Port was already free.
  }

  await delay(1000);
}

async function cleanupConnections() {
  await studentDataSource?.destroy().catch(() => undefined);
  await examPortalDataSource?.destroy().catch(() => undefined);
  await disconnectHrmsMongo().catch(() => undefined);
}

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${signal} received, shutting down gracefully...`);

  if (server) {
    server.close();
  }

  // Exit quickly so the port is released before the watcher spawns a new process.
  void cleanupConnections();
  setTimeout(() => process.exit(0), 250);
}

function registerShutdownHandlers() {
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGUSR2', () => shutdown('SIGUSR2'));
}

async function listenWithRetry(
  app: Express,
  port: number,
  maxAttempts = 15,
): Promise<Server> {
  let lastError: NodeJS.ErrnoException | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await new Promise<Server>((resolve, reject) => {
        const instance = app.listen(port, () => resolve(instance));
        instance.on('error', (err: NodeJS.ErrnoException) => reject(err));
      });
    } catch (err) {
      lastError = err as NodeJS.ErrnoException;
      if (lastError.code !== 'EADDRINUSE' || attempt === maxAttempts) {
        throw lastError;
      }
      const waitMs = 400 * attempt;
      console.warn(
        `Port ${port} busy (dev restart), retrying in ${waitMs}ms... (${attempt}/${maxAttempts})`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw lastError ?? new Error(`Failed to bind port ${port}`);
}

async function bootstrap() {
  registerShutdownHandlers();

  examPortalDataSource = createExamPortalDataSource();
  await examPortalDataSource.initialize();
  console.log('Exam portal database connected');

  studentDataSource = createStudentDataSource();
  await studentDataSource.initialize();
  console.log(
    `Student database connected (${config.studentDb.name}, read-only)`,
  );

  await connectHrmsMongo();
  console.log('HRMS MongoDB connected');

  const services = createServices(examPortalDataSource, studentDataSource);
  const app = createApp(services);

  await freeDevPort(config.port);

  try {
    server = await listenWithRetry(app, config.port);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Port ${config.port} is still in use after retries. Run: npm run predev`,
      );
    }
    throw err;
  }

  console.log(
    `EMS backend (Express) running on http://localhost:${config.port}/${config.apiPrefix}`,
  );
}

bootstrap().catch(async (err) => {
  console.error('Failed to start server:', err);
  await cleanupConnections();
  process.exit(1);
});
