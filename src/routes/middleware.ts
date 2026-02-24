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
 * Route Middleware
 *
 * Common middleware functions used across routes.
 */

import http from 'http';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import passport from 'passport';
import type { PromisifiedRedisClient } from '../lib/redis';
import type { AppLogger } from '../lib/logger';
import type { ConnectionInfo } from '../types/connection';
import type { IOpenhab } from '../types/models';

/**
 * Cache entry for connection info
 */
interface ConnectionCacheEntry {
  connectionInfo: ConnectionInfo | null;
  expiresAt: number;
}

/**
 * In-memory cache for connection info lookups
 * Reduces Redis calls for frequently accessed connection status
 */
const connectionCache = new Map<string, ConnectionCacheEntry>();

// Default cache TTL: 10 seconds
const CONNECTION_CACHE_TTL_MS = 10 * 1000;

// Timeout for internal proxy requests (ms)
const INTERNAL_PROXY_TIMEOUT_MS = 5000;

// Cleanup interval: run every 60 seconds
const CACHE_CLEANUP_INTERVAL_MS = 60 * 1000;

// Periodic cleanup of expired cache entries
// Use unref() to allow Node.js to exit even while timer is active
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of connectionCache) {
    if (now > entry.expiresAt) {
      connectionCache.delete(key);
    }
  }
}, CACHE_CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

/**
 * Invalidate connection cache for an openHAB instance
 * Call this when connection status changes (connect/disconnect)
 */
export function invalidateConnectionCache(openhabId: string): void {
  connectionCache.delete(openhabId);
}

export interface MiddlewareDependencies {
  redis: PromisifiedRedisClient;
  logger: AppLogger;
  systemConfig: {
    getInternalAddress(): string;
    getBaseURL(): string;
    getHost(): string;
    getPort(): number;
    getProxyHost(): string;
    getProxyPort(): number;
  };
}

/**
 * Create route middleware functions
 */
interface RouteMiddleware {
  ensureAuthenticated: RequestHandler;
  ensureRestAuthenticated: RequestHandler;
  ensureMaster: RequestHandler;
  ensureStaff: RequestHandler;
  setOpenhab: RequestHandler;
  ensureServer: RequestHandler;
  preassembleBody: RequestHandler;
}

export function createMiddleware(deps: MiddlewareDependencies): RouteMiddleware {
  const { redis, logger, systemConfig } = deps;

  /**
   * Ensure user is authenticated for web requests
   */
  const ensureAuthenticated: RequestHandler = (req, res, next) => {
    if (req.isAuthenticated()) {
      return next();
    }
    req.session.returnTo = req.originalUrl || req.url;
    res.redirect('/login');
  };

  /**
   * Ensure user is authenticated for REST or proxied requests
   */
  const ensureRestAuthenticated: RequestHandler = (req, res, next) => {
    if (req.isAuthenticated()) {
      return next();
    }
    return passport.authenticate(['basic', 'bearer'], { session: false })(req, res, next);
  };

  /**
   * Ensure user has 'master' role
   */
  const ensureMaster: RequestHandler = (req, res, next) => {
    if (req.user?.role === 'master') {
      return next();
    }
    res.redirect('/');
  };

  /**
   * Ensure user is from 'staff' group
   */
  const ensureStaff: RequestHandler = (req, res, next) => {
    if (req.user?.group === 'staff') {
      return next();
    }
    res.redirect('/');
  };

  /**
   * Apply connection info to request and response locals
   */
  const applyConnectionInfo = (
    connInfo: ConnectionInfo | null,
    req: Request,
    res: Response
  ): void => {
    if (!connInfo) {
      req.connectionInfo = undefined;
      res.locals['openhabstatus'] = 'offline';
      res.locals['openhabMajorVersion'] = 0;
    } else {
      req.connectionInfo = connInfo;
      res.locals['openhabstatus'] = 'online';
      const version = connInfo.openhabVersion;
      if (version) {
        const majorVersion = version.split('.')[0] || '0';
        res.locals['openhabMajorVersion'] = parseInt(majorVersion, 10);
      } else {
        res.locals['openhabMajorVersion'] = 0;
      }
    }
  };

  /**
   * Helper to lookup connection info from Redis (with caching) and set locals
   */
  const lookupConnectionInfo = (
    openhab: IOpenhab,
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    req.openhab = openhab;
    res.locals['openhab'] = openhab;
    res.locals['openhablastonline'] = openhab.last_online;

    const openhabId = openhab._id?.toString() || '';

    // Check cache first
    const cached = connectionCache.get(openhabId);
    if (cached && Date.now() < cached.expiresAt) {
      applyConnectionInfo(cached.connectionInfo, req, res);
      next();
      return;
    }

    const connectionKey = 'connection:' + openhabId;
    redis
      .get(connectionKey)
      .then((result) => {
        let connInfo: ConnectionInfo | null = null;

        if (result) {
          try {
            connInfo = JSON.parse(result) as ConnectionInfo;
          } catch (parseError) {
            logger.error('Failed to parse Redis connection info: ' + parseError);
          }
        }

        // Cache the result (including null for offline)
        connectionCache.set(openhabId, {
          connectionInfo: connInfo,
          expiresAt: Date.now() + CONNECTION_CACHE_TTL_MS,
        });

        applyConnectionInfo(connInfo, req, res);
        next();
      })
      .catch((redisError) => {
        logger.error('openHAB redis lookup error: ' + redisError);
        // Don't cache errors - let the next request try again
        applyConnectionInfo(null, req, res);
        next();
      });
  };

  /**
   * Set openHAB instance on request (required - for API routes)
   * Returns JSON error if no openHAB found
   */
  const setOpenhab: RequestHandler = (req, res, next): void => {
    // Skip if not authenticated
    if (!req.isAuthenticated() || !req.user) {
      next();
      return;
    }

    req.user
      .getOpenhab()
      .then((openhab) => {
        if (!openhab) {
          logger.warn("Can't find the openHAB of user");
          res.status(500).json({
            errors: [{ message: 'openHAB not found' }],
          });
          return;
        }

        lookupConnectionInfo(openhab, req, res, next);
      })
      .catch((error: unknown) => {
        logger.error('openHAB lookup error: ' + error);
        res.status(500).json({
          errors: [{ message: String(error) }],
        });
      });
  };

  /**
   * Proxy request to target internal server address.
   * Returns true if proxy was initiated, false if target is this server.
   */
  const proxyToServer = (
    targetAddress: string,
    req: Request,
    res: Response,
    onError: (err: Error) => void
  ): boolean => {
    if (targetAddress === systemConfig.getInternalAddress()) {
      return false;
    }

    const colonIdx = targetAddress.lastIndexOf(':');
    const targetHost = targetAddress.substring(0, colonIdx);
    const targetPort = parseInt(targetAddress.substring(colonIdx + 1), 10);

    logger.debug(
      `Internal proxy to ${targetAddress} (current: ${systemConfig.getInternalAddress()})`
    );

    const proxyReq = http.request(
      {
        hostname: targetHost,
        port: targetPort,
        path: req.originalUrl,
        method: req.method,
        headers: req.headers,
        timeout: INTERNAL_PROXY_TIMEOUT_MS,
      },
      (proxyRes) => {
        if (res.headersSent) {
          proxyRes.resume(); // drain response to free resources
          return;
        }
        res.writeHead(proxyRes.statusCode!, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('proxy timeout'));
    });

    proxyReq.on('error', onError);

    // Body was already consumed by preassembleBody middleware for most proxy
    // routes. WebSocket upgrade routes (/ws/*) have no body.
    if (req.rawBody !== undefined && req.rawBody !== '') {
      proxyReq.end(req.rawBody);
    } else {
      proxyReq.end();
    }

    return true;
  };

  /**
   * Refresh connection info from Redis (bypassing cache) for an openHAB.
   */
  const refreshConnectionInfo = async (
    openhabId: string
  ): Promise<ConnectionInfo | null> => {
    const connectionKey = 'connection:' + openhabId;
    const result = await redis.get(connectionKey);
    if (!result) {
      connectionCache.set(openhabId, {
        connectionInfo: null,
        expiresAt: Date.now() + CONNECTION_CACHE_TTL_MS,
      });
      return null;
    }
    const connInfo = JSON.parse(result) as ConnectionInfo;
    connectionCache.set(openhabId, {
      connectionInfo: connInfo,
      expiresAt: Date.now() + CONNECTION_CACHE_TTL_MS,
    });
    return connInfo;
  };

  /**
   * Ensure request is served from the correct server (for proxy routes).
   *
   * If this server does not hold the openHAB's WebSocket connection, proxy the
   * request internally to the correct server. The target server's response
   * (including Set-Cookie: CloudServer) is piped back to the client so that
   * subsequent requests are routed directly by nginx via cookie affinity.
   *
   * On proxy failure, invalidates the cache and retries once with fresh
   * connection info from Redis — this handles stale references after restarts.
   */
  const ensureServer: RequestHandler = (req, res, next) => {
    if (!req.connectionInfo?.serverAddress) {
      res.writeHead(500, 'openHAB is offline', {
        'content-type': 'text/plain',
      });
      res.end('openHAB is offline');
      return;
    }

    const openhabId = req.openhab?._id?.toString() || '';
    const targetAddress = req.connectionInfo.serverAddress;

    // Target is this server — handle locally
    if (!proxyToServer(targetAddress, req, res, handleFirstError)) {
      res.cookie('CloudServer', systemConfig.getInternalAddress(), {
        maxAge: 900000,
        httpOnly: true,
      });
      return next();
    }

    function handleFirstError(err: Error) {
      logger.warn(
        `Internal proxy error to ${targetAddress}: ${err.message}, retrying with fresh lookup`
      );

      // If headers were already sent, the response is committed — can't retry
      if (res.headersSent) {
        res.end();
        return;
      }

      // Invalidate stale cache and re-fetch from Redis
      invalidateConnectionCache(openhabId);

      refreshConnectionInfo(openhabId)
        .then((freshInfo) => {
          if (!freshInfo?.serverAddress) {
            logger.warn(`openHAB ${openhabId} no longer connected after proxy failure`);
            if (!res.headersSent) {
              res.writeHead(502, { 'content-type': 'text/plain' });
              res.end('openHAB is offline');
            }
            return;
          }

          // If fresh info points to this server, handle locally
          if (!proxyToServer(freshInfo.serverAddress, req, res, handleRetryError)) {
            req.connectionInfo = freshInfo;
            res.cookie('CloudServer', systemConfig.getInternalAddress(), {
              maxAge: 900000,
              httpOnly: true,
            });
            return next();
          }
        })
        .catch((redisErr) => {
          logger.error(`Redis lookup failed during proxy retry: ${redisErr}`);
          if (!res.headersSent) {
            res.writeHead(502, { 'content-type': 'text/plain' });
            res.end('Bad Gateway');
          }
        });
    }

    function handleRetryError(err: Error) {
      logger.error(`Internal proxy retry failed: ${err.message}`);
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end('Bad Gateway');
      }
    }
  };

  /**
   * Pre-assemble request body for proxy routes
   */
  const preassembleBody: RequestHandler = (req, res, next) => {
    let data = '';
    if (req.rawBody === undefined || req.rawBody === '') {
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      req.on('end', () => {
        req.rawBody = data;
        next();
      });
      req.on('error', (err) => {
        logger.error('Error reading request body: ' + err);
        next(err);
      });
    } else {
      req.rawBody = req.rawBody.toString();
      next();
    }
  };

  return {
    ensureAuthenticated,
    ensureRestAuthenticated,
    ensureMaster,
    ensureStaff,
    setOpenhab,
    ensureServer,
    preassembleBody,
  };
}
