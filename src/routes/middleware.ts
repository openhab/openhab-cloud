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
import type { Socket as NetSocket } from 'net';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import passport from 'passport';
import type { PromisifiedRedisClient } from '../lib/redis';
import type { AppLogger } from '../lib/logger';
import type { ConnectionInfo } from '../types/connection';
import type { IOpenhab, IWebhook } from '../types/models';
import { openhabCache } from '../lib/lookup-caches';

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

// Idle timeout for internal proxy requests (ms). Guards connection setup and
// time-to-first-byte so a dead/unreachable target node fails fast. It is
// cleared once the upstream response begins streaming (see proxyToServer) so
// long-lived streaming responses (SSE: /rest/events, /rest/events/states) that
// sit quiet between events are not torn down.
const INTERNAL_PROXY_TIMEOUT_MS = 10000;

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
 * True if this request is a WebSocket upgrade.
 *
 * The sec-websocket-* headers are checked as well because a reverse proxy in
 * front of us may strip the hop-by-hop Upgrade/Connection headers.
 */
export function isWebSocketUpgrade(req: Request): boolean {
  return req.headers['upgrade']?.toLowerCase() === 'websocket'
    || (req.headers['sec-websocket-key'] != null && req.headers['sec-websocket-version'] != null);
}

/**
 * Invalidate connection cache for an openHAB instance
 * Call this when connection status changes (connect/disconnect)
 */
export function invalidateConnectionCache(openhabId: string): void {
  connectionCache.delete(openhabId);
}

/**
 * Get connection info from cache or Redis.
 * Returns null if the instance is offline or not found.
 */
export async function getConnectionInfoCached(
  openhabId: string,
  redis: PromisifiedRedisClient,
  logger: AppLogger
): Promise<ConnectionInfo | null> {
  const cached = connectionCache.get(openhabId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.connectionInfo;
  }

  const connectionKey = 'connection:' + openhabId;
  try {
    const result = await redis.get(connectionKey);
    let connInfo: ConnectionInfo | null = null;
    if (result) {
      try {
        connInfo = JSON.parse(result) as ConnectionInfo;
      } catch (parseError) {
        logger.error('Failed to parse Redis connection info: ' + parseError);
      }
    }
    connectionCache.set(openhabId, {
      connectionInfo: connInfo,
      expiresAt: Date.now() + CONNECTION_CACHE_TTL_MS,
    });
    return connInfo;
  } catch (redisError) {
    logger.error('openHAB redis lookup error: ' + redisError);
    return null;
  }
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
    getProxyURL(): string;
    getBrowserProxyHost(): string | undefined;
    getBrowserProxyURL(): string | undefined;
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

    // Every proxied request resolves the user's openHAB, so a page pulling ~90
    // assets would otherwise be ~90 findOne calls. Cache it per account, and
    // share one lookup between the requests that arrive together on a miss.
    const accountId = req.user.account?.toString();
    const loadOpenhab = (): Promise<IOpenhab | null> => req.user!.getOpenhab();

    const resolveOpenhab = accountId
      ? openhabCache.getOrLoad(accountId, loadOpenhab)
      : loadOpenhab();

    resolveOpenhab
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

    // Once the WebSocket tunnel is up the sockets own their own lifecycle:
    // proxyReq is detached, so neither client disconnects nor late errors
    // should tear anything down through the HTTP paths below.
    let upgraded = false;

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
        // The upstream response has started. Disable the idle timeout so
        // long-lived streaming responses (SSE) that go quiet between events
        // are not destroyed mid-stream; teardown is handled by the client
        // disconnect (res 'close') and the orphaned-request cleanup instead.
        proxyReq.setTimeout(0);
        if (res.headersSent) {
          proxyRes.resume(); // drain response to free resources
          return;
        }
        res.writeHead(proxyRes.statusCode!, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );

    // WebSocket upgrades: the target node answers 101 and Node emits 'upgrade'
    // instead of 'response'. Without this listener Node destroys the socket,
    // so WebSockets only worked when the client happened to land on the node
    // holding the openHAB connection.
    if (isWebSocketUpgrade(req)) {
      proxyReq.on('upgrade', (proxyRes, upstreamSocket, upstreamHead) => {
        proxyReq.setTimeout(0);
        upgraded = true;

        const clientSocket = res.socket;
        if (!clientSocket || clientSocket.destroyed) {
          upstreamSocket.destroy();
          return;
        }

        // When the upgrade reached us through Express (a reverse proxy stripped
        // the hop-by-hop headers so server.on('upgrade') never fired), the HTTP
        // parser is still listening and would read WebSocket frames as HTTP.
        clientSocket.removeAllListeners('data');
        const httpResponse = res as unknown as http.ServerResponse;
        if (typeof httpResponse.detachSocket === 'function') {
          httpResponse.detachSocket(clientSocket);
        }

        // rawHeaders keeps the origin node's casing and order intact
        let rawResponse = `HTTP/1.1 ${proxyRes.statusCode} ${proxyRes.statusMessage || 'Switching Protocols'}\r\n`;
        for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
          rawResponse += `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`;
        }
        rawResponse += '\r\n';
        clientSocket.write(rawResponse);

        // Tells the synthetic ServerResponse's 'finish' handler in app.ts to
        // leave this socket alone — it belongs to the tunnel now.
        (clientSocket as NetSocket & { __upgraded?: boolean }).__upgraded = true;

        if (upstreamHead && upstreamHead.length > 0) {
          upstreamSocket.unshift(upstreamHead);
        }

        clientSocket.setTimeout(0);
        upstreamSocket.setTimeout(0);
        clientSocket.setNoDelay(true);
        upstreamSocket.setNoDelay(true);

        clientSocket.pipe(upstreamSocket);
        upstreamSocket.pipe(clientSocket);

        let closed = false;
        const teardown = (reason: string) => {
          if (closed) return;
          closed = true;
          logger.debug(`Internal WebSocket proxy to ${targetAddress} closed (${reason})`);
          clientSocket.destroy();
          upstreamSocket.destroy();
        };

        clientSocket.on('close', () => teardown('client close'));
        clientSocket.on('error', (err) => teardown(`client error: ${err.message}`));
        upstreamSocket.on('close', () => teardown('upstream close'));
        upstreamSocket.on('error', (err) => teardown(`upstream error: ${err.message}`));

        logger.info(`Internal WebSocket proxy established to ${targetAddress}`);
      });
    }

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('proxy timeout'));
    });

    proxyReq.on('error', (err) => {
      if (upgraded) return;
      onError(err);
    });

    // Tear down the internal proxy request if the client disconnects. The idle
    // timeout is cleared once the response starts streaming (see above), so for
    // long-lived streaming responses (SSE) this is what reaps the upstream
    // connection when the client goes away — .pipe() does not propagate the
    // client-side close to destroy the source request.
    res.on('close', () => {
      if (!upgraded && !proxyReq.destroyed) {
        proxyReq.destroy();
      }
    });

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

/**
 * Create middleware that rejects requests with bodies exceeding maxBytes.
 * Checks Content-Length upfront and also monitors actual bytes streamed.
 */
export function createBodySizeLimit(maxBytes: number): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      res.status(413).json({ error: 'Request body too large' });
      return;
    }

    let received = 0;
    req.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (received > maxBytes) {
        req.destroy();
        if (!res.headersSent) {
          res.status(413).json({ error: 'Request body too large' });
        }
      }
    });

    next();
  };
}

/**
 * Repository interface for webhook lookup
 */
export interface IWebhookRepositoryForMiddleware {
  findByUuid(uuid: string): Promise<IWebhook | null>;
}

/**
 * Repository interface for openhab lookup by ID
 */
export interface IOpenhabRepositoryForMiddleware {
  findById(id: string): Promise<IOpenhab | null>;
}

/**
 * Create middleware that looks up a webhook by UUID and sets req.openhab
 * and req.webhookLocalPath. No user authentication — the UUID is the secret.
 */
export function createSetOpenhabForWebhook(
  webhookRepository: IWebhookRepositoryForMiddleware,
  openhabRepository: IOpenhabRepositoryForMiddleware,
  redis: PromisifiedRedisClient,
  logger: AppLogger
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const uuidParam = req.params['uuid'];
    const uuid = Array.isArray(uuidParam) ? uuidParam[0] : uuidParam;
    if (!uuid) {
      res.status(400).json({ error: 'Missing webhook UUID' });
      return;
    }

    try {
      const webhook = await webhookRepository.findByUuid(uuid);
      if (!webhook || webhook.expiresAt <= new Date()) {
        res.status(404).json({ error: 'Webhook not found or expired' });
        return;
      }

      const openhab = await openhabRepository.findById(webhook.openhab.toString());
      if (!openhab) {
        res.status(404).json({ error: 'openHAB instance not found' });
        return;
      }

      req.openhab = openhab;

      // Append any sub-path after the UUID to the webhook's local path
      // e.g. /api/hooks/{uuid}/extra/path → localPath + /extra/path
      const subpathParam = req.params['subpath'];
      const subpath = Array.isArray(subpathParam) ? subpathParam.join('/') : subpathParam;
      req.webhookLocalPath = subpath ? webhook.localPath + '/' + subpath : webhook.localPath;

      const openhabId = openhab._id?.toString() || '';
      const connInfo = await getConnectionInfoCached(openhabId, redis, logger);
      if (!connInfo) {
        res.status(502).json({ error: 'openHAB instance is offline' });
        return;
      }

      req.connectionInfo = connInfo;
      next();
    } catch (error) {
      logger.error('Error in webhook middleware: ' + error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

/**
 * OAuth metadata documents a webhook target may publish. Anything else is not
 * proxied, so an arbitrary path can't be reached through the well-known route.
 */
export const WELL_KNOWN_OAUTH_DOCS = new Set([
  'oauth-authorization-server',
  'oauth-protected-resource',
  'openid-configuration',
]);

function wellKnownDoc(req: Request): string {
  const param = req.params['doc'];
  return (Array.isArray(param) ? param[0] : param) ?? '';
}

/**
 * Pass only recognised well-known documents through. Runs ahead of the webhook
 * lookup so an unknown document costs no database round-trip.
 */
export const requireWellKnownDoc: RequestHandler = (req, _res, next) => {
  if (!WELL_KNOWN_OAUTH_DOCS.has(wellKnownDoc(req))) {
    next('route');
    return;
  }
  next();
};

/**
 * Point the proxy at the document under the webhook's local path. Runs after
 * createSetOpenhabForWebhook, which has already resolved req.webhookLocalPath.
 *
 * Re-checks the document rather than trusting requireWellKnownDoc to have run:
 * the value is interpolated into the path we proxy to, so an unchecked one would
 * reach any endpoint on the user's openHAB without authentication.
 */
export const appendWellKnownPath: RequestHandler = (req, _res, next) => {
  const doc = wellKnownDoc(req);
  const basePath = req.webhookLocalPath;
  if (!basePath || !WELL_KNOWN_OAUTH_DOCS.has(doc)) {
    next('route');
    return;
  }
  // localPath is stored as the add-on sent it, so it may carry a trailing slash.
  req.webhookLocalPath = `${basePath.replace(/\/+$/, '')}/.well-known/${doc}`;
  next();
};
