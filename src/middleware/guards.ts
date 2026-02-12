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

import type { RequestHandler, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import type { IOpenhab, UserRole, UserGroup } from '../types/models';
import type { ConnectionInfo } from '../types/connection';
import type { ILogger } from '../types/notification';

/**
 * Redis client interface for connection info lookup
 */
export interface IRedisClient {
  get(key: string): Promise<string | null>;
}

/**
 * Configuration for OpenHAB middleware
 */
export interface OpenhabMiddlewareConfig {
  redis: IRedisClient;
  logger: ILogger;
  getInternalAddress: () => string;
}

/**
 * Ensure user is authenticated for web requests
 *
 * If not authenticated, redirects to login page with return URL.
 */
export const ensureAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }

  // Store the URL to return to after login
  if (req.session) {
    (req.session as unknown as Record<string, unknown>)['returnTo'] = req.originalUrl || req.url;
  }

  res.redirect('/login');
};

/**
 * Ensure user is authenticated for REST/API requests
 *
 * Attempts session auth first, then falls back to Basic or Bearer auth.
 * Does not redirect on failure - returns 401.
 */
export const ensureRestAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }

  // Try Basic or Bearer authentication
  return passport.authenticate(['basic', 'bearer'], { session: false })(req, res, next);
};

/**
 * Create a guard that ensures user has a specific role
 *
 * @param role - Required role
 * @returns Middleware that checks user role
 */
export function ensureRole(role: UserRole): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return res.redirect('/login');
    }

    if (req.user.role === role) {
      return next();
    }

    // User doesn't have required role
    res.redirect('/');
  };
}

/**
 * Ensure user has 'master' role
 *
 * The 'master' role is the primary account holder who can:
 * - Manage other users
 * - Delete the account
 * - Access all settings
 */
export const ensureMaster: RequestHandler = ensureRole('master');

/**
 * Create a guard that ensures user belongs to a specific group
 *
 * @param group - Required group
 * @returns Middleware that checks user group
 */
export function ensureGroup(group: UserGroup): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      return res.redirect('/login');
    }

    if (req.user.group === group) {
      return next();
    }

    // User doesn't belong to required group
    res.redirect('/');
  };
}

/**
 * Ensure user belongs to 'staff' group
 *
 * Staff users can access admin functionality.
 */
export const ensureStaff: RequestHandler = ensureGroup('staff');

/**
 * Create middleware to set the user's openHAB instance on the request
 *
 * This middleware:
 * 1. Looks up the user's openHAB instance
 * 2. Fetches connection info from Redis
 * 3. Sets req.openhab and res.locals for templates
 *
 * @param config - Configuration with redis, logger, and address getter
 * @returns Middleware function
 */
export function createSetOpenhabMiddleware(config: OpenhabMiddlewareConfig): RequestHandler {
  const { redis, logger } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Skip if not authenticated
    if (!req.isAuthenticated() || !req.user) {
      return next();
    }

    try {
      // Get the user's openHAB - user model has openhab() method
      // This is a callback-based method, so we need to promisify it
      const openhab = await new Promise<IOpenhab | null>((resolve, reject) => {
        // The user object should have an openhab method from the model
        const userWithOpenhab = req.user as { openhab?: (cb: (err: Error | null, oh: IOpenhab | null) => void) => void };

        if (typeof userWithOpenhab.openhab !== 'function') {
          // Fall back to looking up by account if method doesn't exist
          logger.warn('User object missing openhab() method');
          resolve(null);
          return;
        }

        userWithOpenhab.openhab((error, oh) => {
          if (error) {
            reject(error);
          } else {
            resolve(oh);
          }
        });
      });

      if (!openhab) {
        logger.warn("Can't find the openHAB of user");
        return res.status(500).json({
          errors: [{ message: 'openHAB not found' }],
        });
      }

      // Set openHAB on request and response locals
      req.openhab = openhab;
      res.locals.openhab = openhab;
      res.locals.openhablastonline = openhab.last_online;

      // Fetch connection info from Redis
      const connectionKey = `connection:${openhab._id.toString()}`;
      const connectionData = await redis.get(connectionKey);

      if (!connectionData) {
        req.connectionInfo = {};
        res.locals.openhabstatus = 'offline';
        res.locals.openhabMajorVersion = 0;
      } else {
        let connectionInfo: ConnectionInfo;
        try {
          connectionInfo = JSON.parse(connectionData) as ConnectionInfo;
        } catch {
          logger.warn('Invalid JSON in Redis connection data');
          req.connectionInfo = {};
          res.locals.openhabstatus = 'offline';
          res.locals.openhabMajorVersion = 0;
          return next();
        }
        req.connectionInfo = connectionInfo;
        res.locals.openhabstatus = 'online';

        if (connectionInfo.openhabVersion) {
          const majorVersion = connectionInfo.openhabVersion.split('.')[0];
          res.locals.openhabMajorVersion = majorVersion ? parseInt(majorVersion, 10) : 0;
        } else {
          res.locals.openhabMajorVersion = 0;
        }
      }

      return next();
    } catch (error) {
      logger.error('openHAB lookup error:', error);
      return res.status(500).json({
        errors: [{ message: 'Internal server error' }],
      });
    }
  };
}

/**
 * Create middleware to ensure request is routed to correct server
 *
 * In a multi-server deployment, requests must be handled by the server
 * that has the WebSocket connection to the user's openHAB. This middleware
 * redirects to the correct server if needed.
 *
 * @param config - Configuration with address getter
 * @returns Middleware function
 */
export function createEnsureServerMiddleware(config: {
  getInternalAddress: () => string;
}): RequestHandler {
  const { getInternalAddress } = config;

  return (req, res, next) => {
    if (!req.connectionInfo?.serverAddress) {
      res.writeHead(500, 'openHAB is offline', {
        'content-type': 'text/plain',
      });
      res.end('openHAB is offline');
      return;
    }

    const currentServer = getInternalAddress();

    if (req.connectionInfo.serverAddress !== currentServer) {
      // Redirect to the correct server (handled by nginx internally)
      res.redirect(307, `http://${req.connectionInfo.serverAddress}${req.path}`);
      return;
    }

    // Set cookie for client to know which server they're connected to
    res.cookie('CloudServer', currentServer, { maxAge: 900000, httpOnly: true });
    return next();
  };
}

/**
 * Middleware to pre-assemble request body for proxying
 *
 * Collects the raw request body for forwarding to openHAB.
 */
export const preassembleBody: RequestHandler = (req, res, next) => {
  // If rawBody is already set (JSON/URL-encoded), convert to string
  if (req.rawBody !== undefined && req.rawBody !== '') {
    req.rawBody = req.rawBody.toString();
    return next();
  }

  // Collect data chunks
  let data = '';

  req.on('data', (chunk: Buffer | string) => {
    data += typeof chunk === 'string' ? chunk : chunk.toString();
  });

  req.on('end', () => {
    req.rawBody = data;
    next();
  });
};
