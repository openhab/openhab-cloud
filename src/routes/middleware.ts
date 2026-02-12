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

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import passport from 'passport';
import type { PromisifiedRedisClient } from '../lib/redis';
import type { AppLogger } from '../lib/logger';
import type { ConnectionInfo } from '../types/connection';
import type { IOpenhab } from '../types/models';

export interface MiddlewareDependencies {
  redis: PromisifiedRedisClient;
  logger: AppLogger;
  systemConfig: {
    getInternalAddress(): string;
    getHost(): string;
    getPort(): number;
    getProxyHost(): string;
    getProxyPort(): number;
  };
}

/**
 * Create route middleware functions
 */
export function createMiddleware(deps: MiddlewareDependencies) {
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
   * Helper to lookup connection info from Redis and set locals
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
    const connectionKey = 'connection:' + openhabId;
    logger.debug(`Looking up connection status for key: ${connectionKey}`);
    redis
      .get(connectionKey)
      .then((result) => {
        logger.debug(`Connection lookup result for ${connectionKey}: ${result ? 'found' : 'not found'}`);
        if (!result) {
          req.connectionInfo = {};
          res.locals['openhabstatus'] = 'offline';
          res.locals['openhabMajorVersion'] = 0;
        } else {
          let connInfo: ConnectionInfo;
          try {
            connInfo = JSON.parse(result) as ConnectionInfo;
          } catch (parseError) {
            logger.error('Failed to parse Redis connection info: ' + parseError);
            req.connectionInfo = {};
            res.locals['openhabstatus'] = 'offline';
            res.locals['openhabMajorVersion'] = 0;
            next();
            return;
          }
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
        next();
      })
      .catch((redisError) => {
        logger.error('openHAB redis lookup error: ' + redisError);
        req.connectionInfo = {};
        res.locals['openhabstatus'] = 'offline';
        res.locals['openhabMajorVersion'] = 0;
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
   * Ensure request is served from the correct server (for proxy routes)
   */
  const ensureServer: RequestHandler = (req, res, next) => {
    if (!req.connectionInfo?.serverAddress) {
      res.writeHead(500, 'openHAB is offline', {
        'content-type': 'text/plain',
      });
      res.end('openHAB is offline');
      return;
    }

    if (req.connectionInfo.serverAddress !== systemConfig.getInternalAddress()) {
      // Redirect to correct cloud server using http:// for internal nginx routing
      // nginx intercepts these internal redirects and proxies them, not the client
      logger.debug(
        `Redirecting to correct server: ${req.connectionInfo.serverAddress} (current: ${systemConfig.getInternalAddress()})`
      );
      res.redirect(307, 'http://' + req.connectionInfo.serverAddress + req.path);
      return;
    }

    res.cookie('CloudServer', systemConfig.getInternalAddress(), {
      maxAge: 900000,
      httpOnly: true,
    });
    return next();
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
