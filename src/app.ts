/*
 * Copyright (c) 2010-2026 Contributors to the openHAB project
 *
 * See the NOTICE file(s) distributed with this work for additional
 * information.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0
 *
 * SPDX-License-Identifier: EPL-2.0
 */

/**
 * openHAB Cloud Application - TypeScript Entry Point
 *
 * This is the migrated TypeScript version of app.js that can run
 * the full application.
 */

import express, { Express, Request, Response, NextFunction } from 'express';
import http from 'http';
import type { Socket as NetSocket } from 'net';
import path from 'path';
import flash from 'connect-flash';
import bodyParser from 'body-parser';
import errorHandler from 'errorhandler';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import favicon from 'serve-favicon';
import { csrfSync } from 'csrf-sync';
import serveStatic from 'serve-static';
import passport from 'passport';
import mongoose from 'mongoose';
import { RedisStore } from 'connect-redis';

import { loadConfig, SystemConfigManager } from './config';
import { createLoggerFromConfig } from './lib/logger';
import { createRedisClient } from './lib/redis';
import type { AppLogger } from './lib/logger';
import type { PromisifiedRedisClient } from './lib/redis';

import { createRoutes } from './routes';
import { HealthController } from './controllers';
import { createServices } from './factories';
import { SocketServer, ConnectionManager } from './socket';
import { configurePassport } from './middleware/auth.middleware';
import { MongoConnect } from './lib/mongoconnect';
import dateUtil from './lib/date-util';
import { User, Openhab, Event, UserDevice, Invitation } from './models';
import { JobScheduler, StatsJob } from './jobs';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer | string;
    }
  }
}

/**
 * Application container
 */
export interface AppContainer {
  app: Express;
  server: ReturnType<Express['listen']>;
  configManager: SystemConfigManager;
  logger: AppLogger;
  redis: PromisifiedRedisClient;
  jobScheduler: JobScheduler;
  socketServer: SocketServer;
  services: ReturnType<typeof createServices>;
}

/**
 * Initialize and start the application
 */
export async function createApp(configPath: string): Promise<AppContainer> {
  // Load configuration
  const config = loadConfig(configPath);
  const configManager = new SystemConfigManager(config);

  // Create logger
  const processPort = configManager.getNodeProcessPort();
  const logger = createLoggerFromConfig(config.system.logger, processPort);

  logger.info('Backend service is starting up...');

  // Handle uncaught exceptions - log and exit
  // After an uncaught exception, the process is in an undefined state
  // Per Node.js docs, the correct approach is to exit after logging
  process.on('uncaughtException', (err: Error) => {
    console.error('Uncaught exception:', JSON.stringify(err));
    logger.error('Uncaught exception:', err);
    // Give logger time to flush, then exit
    setTimeout(() => process.exit(1), 1000);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    logger.error('Unhandled promise rejection at:', promise, 'reason:', reason);
  });

  // Create Redis client (async in redis v5)
  const redis = await createRedisClient(config.redis, logger);

  // Initialize MongoDB connection
  const mongoConnect = new MongoConnect(
    {
      hasDbCredentials: () => configManager.hasDbCredentials(),
      getDbUser: () => configManager.getDbUser(),
      getDbPass: () => configManager.getDbPass(),
      getDbHostsString: () => configManager.getDbHostsString(),
      getDbName: () => configManager.getDbName(),
      getDbAuthSource: () => configManager.getDbAuthSource(),
    },
    logger
  );
  await mongoConnect.connect(mongoose);

  logger.info('Backend logging initialized...');

  // Create Express app
  const app = express();

  // Create job scheduler and register jobs
  const jobScheduler = new JobScheduler(logger);
  const statsJob = new StatsJob({
    redis,
    logger,
    userModel: User,
    openhabModel: Openhab,
    userDeviceModel: UserDevice,
    invitationModel: Invitation,
  });
  jobScheduler.register(statsJob);

  // Trust proxy for correct client IP and protocol detection behind reverse proxy
  app.set('trust proxy', 1);

  // Configure session cookie (matching original behavior)
  // Note: We don't set secure/httpOnly/sameSite explicitly to match original app.js
  // which relied on defaults. This avoids issues with reverse proxies.
  const cookie: session.CookieOptions = {};
  if (config.system.subDomainCookies) {
    cookie.path = '/';
    cookie.domain = '.' + configManager.getHost();
    logger.info('Cross sub domain cookie support is configured for domain: ' + cookie.domain);
  }

  // Development mode configuration
  if (app.get('env') === 'development') {
    app.use(errorHandler());
  }

  // Morgan logging (if configured)
  const morganOption = configManager.getLoggerMorganOption();
  if (morganOption) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const morgan = require('morgan');
    app.use(morgan(morganOption));
  }

  // App configuration
  app.set('port', processPort);
  app.set('views', path.join(__dirname, '../views'));
  app.set('view engine', 'ejs');

  // Middleware
  app.use(favicon(path.join(__dirname, '../public/img/favicon.ico')));
  app.use(
    bodyParser.json({
      verify: (req: Request, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(
    bodyParser.urlencoded({
      verify: (req: Request, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      },
      extended: true,
    })
  );
  app.use(cookieParser(config.express.key));

  // Session with Redis store
  app.use(
    session({
      secret: config.express.key,
      store: new RedisStore({
        client: redis.nativeClient,
      }),
      cookie,
      resave: false,
      saveUninitialized: false,
    })
  );

  app.use(flash());
  app.use(passport.initialize());
  app.use(passport.session());

  // Remote proxy URL rewriting middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const host = req.headers.host;
    if (!host) {
      next();
      return;
    }
    if (host.indexOf('remote.') === 0 || host === configManager.getProxyHost()) {
      if (req.url.indexOf('/remote') !== 0) {
        req.url = '/remote' + req.url;
      }
    }
    next();
  });

  // CSRF protection (except for API, REST, and remote routes)
  const { csrfSynchronisedProtection, generateToken } = csrfSync({
    getTokenFromRequest: (req: Request) => req.body?.['_csrf'] as string ?? req.headers['csrf-token'] as string,
    errorConfig: {
      statusCode: 403,
      message: 'Invalid CSRF token. Please refresh the page and try again.',
      code: 'EBADCSRFTOKEN',
    },
    skipCsrfProtection: (req: Request) => {
      const p = req.path;
      return (
        p.startsWith('/api/') ||
        p.startsWith('/rest') ||
        p.startsWith('/ws/') ||
        p === '/oauth2/token' ||
        p.startsWith('/ifttt/') ||
        p.startsWith('/remote/')
      );
    },
  });
  app.use(csrfSynchronisedProtection);

  // CSRF token for templates
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (typeof req.csrfToken === 'function') {
      res.locals['token'] = req.csrfToken();
    } else {
      res.locals['token'] = generateToken(req);
    }
    next();
  });

  // Global template locals
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals['baseurl'] = configManager.getBaseURL();
    res.locals['proxyUrl'] = configManager.getProxyURL();

    const session = (_req as Request & { session: { timezone?: string } }).session;
    if (session?.timezone) {
      res.locals['timeZone'] = session.timezone;
    } else {
      res.locals['timeZone'] = 'undefined';
    }

    res.locals['date_util'] = dateUtil;

    res.locals['legal'] = false;
    if (config.legal) {
      res.locals['legal'] = true;
      res.locals['terms'] = config.legal.terms;
      res.locals['policy'] = config.legal.policy;
    }
    res.locals['registration_enabled'] = configManager.isUserRegistrationEnabled();
    next();
  });

  // Static files
  app.use(serveStatic(path.join(__dirname, '../public')));

  // Start HTTP server
  const server = app.listen(processPort, config.system.listenIp, () => {
    logger.info('Express server listening on port ' + processPort);
  });

  // Create services using factory
  const services = createServices({
    configManager,
    logger,
  });

  // Configure Passport authentication strategies
  configurePassport(services.authService, logger);

  // Setup Socket.IO with TypeScript module
  const socketSystemConfig = {
    getInternalAddress: () => configManager.getInternalAddress(),
    getConnectionLockTimeSeconds: () => configManager.getConnectionLockTimeSeconds(),
  };

  const connectionManager = new ConnectionManager(
    {
      get: async (key: string) => redis.get(key),
      set: async (key: string, value: string, ...args: (string | number)[]) =>
        redis.set(key, value, ...args),
      del: async (key: string) => redis.del(key),
      ttl: async (key: string) => redis.ttl(key),
      expire: async (key: string, seconds: number) => redis.expire(key, seconds),
      watch: async (key: string) => redis.watch(key),
      unwatch: async () => redis.unwatch(),
      multi: () => {
        const m = redis.multi();
        return {
          expire: (key: string, seconds: number) => { m.expire(key, seconds); return m; },
          get: (key: string) => { m.get(key); return m; },
          del: (key: string) => { m.del(key); return m; },
          exec: async () => m.exec(),
        };
      },
    },
    {
      findByUuid: async (uuid: string) =>
        Openhab.findOne({ uuid }),
      updateLastOnline: async (id: string) => {
        await Openhab.findByIdAndUpdate(id, { $set: { last_online: new Date() } });
      },
    },
    socketSystemConfig,
    logger
  );

  const socketServer = new SocketServer(
    connectionManager,
    {
      findByUsername: async (username: string) => User.findOne({ username }),
      findByAccount: async (accountId: string) => User.find({ account: accountId }),
    },
    {
      findById: async (id: string) => Openhab.findById(id),
      updateLastOnline: async (id: string) => {
        await Openhab.findByIdAndUpdate(id, { $set: { last_online: new Date() } });
      },
    },
    {
      create: async (data: { openhab: unknown; source: string; status: string; color: string }) => {
        const event = new Event(data);
        return event.save();
      },
    },
    services.notificationService,
    socketSystemConfig,
    logger
  );

  // Initialize socket server with the HTTP server
  socketServer.initialize(server);

  // Setup routes using TypeScript routes module
  const healthController = new HealthController({
    isEnabled: () => configManager.isHealthEndpointEnabled(),
  });

  const router = createRoutes({
    redis,
    logger,
    systemConfig: {
      getInternalAddress: () => configManager.getInternalAddress(),
      getBaseURL: () => configManager.getBaseURL(),
      getHost: () => configManager.getHost(),
      getPort: () => configManager.getPort(),
      getProxyHost: () => configManager.getProxyHost(),
      getProxyPort: () => configManager.getProxyPort(),
    },
    healthController,
    services,
    io: socketServer.getIO()!,
    requestTracker: socketServer.getRequestTracker(),
    iftttEnabled: configManager.isIFTTTEnabled(),
    hasLegalTerms: configManager.hasLegalTerms(),
    hasLegalPolicy: configManager.hasLegalPolicy(),
    registrationEnabled: configManager.isUserRegistrationEnabled(),
    devicesConfig: {
      getBaseURL: () => configManager.getBaseURL(),
      getAppleLink: () => configManager.getAppleLink(),
      getAndroidLink: () => configManager.getAndroidLink(),
    },
    apiConfig: {
      isGcmConfigured: () => configManager.isGcmConfigured(),
      getGcmSenderId: () => configManager.isGcmConfigured() ? configManager.getGcmSenderId() : '',
      getProxyURL: () => configManager.getProxyURL(),
      getAppleId: () => configManager.getAppleId(),
      getAndroidId: () => configManager.getAndroidId(),
    },
    iftttConfig: {
      getChannelKey: () => configManager.getIftttChannelKey(),
      getTestToken: () => configManager.getIftttTestToken(),
      getBaseURL: () => configManager.getBaseURL(),
    },
  });
  app.use(router);

  // Error handling middleware - must be last
  // This catches errors from routes/middleware and returns proper error responses
  // instead of letting them propagate to uncaughtException
  app.use((err: Error & { code?: string; status?: number }, req: Request, res: Response, _next: NextFunction) => {
    // Log the error
    logger.error('Express error handler caught:', {
      error: err.message,
      stack: err.stack,
      code: err.code,
      path: req.path,
      method: req.method,
    });

    // CSRF errors
    if (err.code === 'EBADCSRFTOKEN') {
      res.status(403);
      if (req.accepts('html')) {
        res.render('error', {
          title: 'Error',
          message: 'Invalid CSRF token. Please refresh the page and try again.',
          error: {},
        });
      } else {
        res.json({ error: 'Invalid CSRF token' });
      }
      return;
    }

    // Other errors
    const status = err.status || 500;
    res.status(status);
    if (req.accepts('html')) {
      res.render('error', {
        title: 'Error',
        message: err.message || 'Something went wrong',
        error: app.get('env') === 'development' ? err : {},
      });
    } else {
      res.json({
        error: err.message || 'Internal server error',
        ...(app.get('env') === 'development' && { stack: err.stack }),
      });
    }
  });

  // Handle HTTP upgrade events for WebSocket proxy (/ws/ paths)
  // Socket.IO handles its own upgrades on /socket.io/ — we only intercept /ws/
  server.on('upgrade', (req: http.IncomingMessage, socket: NetSocket, head: Buffer) => {
    if (req.url && req.url.startsWith('/ws/')) {
      // Create a synthetic ServerResponse so Express can process
      // the request through its middleware chain (auth, setOpenhab, ensureServer)
      const res = new http.ServerResponse(req);
      res.assignSocket(socket);

      // For successful 101 upgrades, the proxy handler writes raw HTTP directly
      // to the socket and takes ownership. We use a flag on the socket to track
      // whether the upgrade completed — if it did, 'finish' must NOT destroy it.
      // This guards against Node.js internals or middleware unexpectedly
      // triggering 'finish' on the synthetic ServerResponse.
      (socket as NetSocket & { __upgraded?: boolean }).__upgraded = false;

      res.on('finish', () => {
        if (!(socket as NetSocket & { __upgraded?: boolean }).__upgraded && !socket.destroyed) {
          res.detachSocket(socket);
          socket.destroy();
        }
      });

      // If the socket has head data from the upgrade, push it back
      if (head && head.length > 0) {
        socket.unshift(head);
      }

      // Process through Express middleware
      app(req as unknown as Request, res as unknown as Response);
    }
    // Else: let Socket.IO or other handlers deal with it
  });

  return {
    app,
    server,
    configManager,
    logger,
    redis,
    jobScheduler,
    socketServer,
    services,
  };
}

/**
 * Graceful shutdown
 */
export async function shutdown(container: AppContainer): Promise<void> {
  const { logger, server, redis, jobScheduler, socketServer } = container;

  logger.info('Shutting down...');

  // Stop job scheduler
  jobScheduler.stopAll();
  logger.info('Stopped background jobs');

  // Shutdown Socket.IO
  if (socketServer) {
    await socketServer.shutdown();
    logger.info('Socket.IO shutdown complete');
  }

  // Close HTTP server
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  logger.info('HTTP server closed');

  // Close Redis
  await redis.quit();
  logger.info('Redis connection closed');

  // Close MongoDB connection
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');

  logger.info('Shutdown complete');
}

// Main entry point
if (require.main === module) {
  const configPath = process.env['CONFIG_PATH'] || path.join(__dirname, '../config.json');

  createApp(configPath)
    .then((container) => {
      container.logger.info('openHAB Cloud started successfully');

      // Start job scheduler
      container.jobScheduler.startAll();

      // Handle shutdown signals
      const handleShutdown = async (signal: string) => {
        container.logger.info(`Received ${signal}, initiating shutdown...`);

        // Force exit after 10 seconds if graceful shutdown stalls
        const forceExitTimeout = setTimeout(() => {
          container.logger.warn('Graceful shutdown timed out, forcing exit');
          process.exit(1);
        }, 10000);
        forceExitTimeout.unref(); // Don't let this timer keep the process alive

        try {
          await shutdown(container);
          clearTimeout(forceExitTimeout);
          process.exit(0);
        } catch (error) {
          container.logger.error('Error during shutdown:', error);
          clearTimeout(forceExitTimeout);
          process.exit(1);
        }
      };

      process.on('SIGTERM', () => handleShutdown('SIGTERM'));
      process.on('SIGINT', () => handleShutdown('SIGINT'));

      // Handle SIGHUP for config reload (similar to legacy app.js)
      process.on('SIGHUP', () => {
        container.logger.info('Received SIGHUP - config reload not yet supported in TS version');
      });
    })
    .catch((error) => {
      console.error('Failed to start application:', error);
      process.exit(1);
    });
}
