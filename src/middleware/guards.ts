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

import type { RequestHandler } from 'express';
import passport from 'passport';
import type { UserRole, UserGroup } from '../types/models';

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
  const authHeader = req.headers['authorization'];
  console.log(`[REST Auth] ${req.method} ${req.path} - auth header: ${authHeader ? authHeader.substring(0, 20) + '...' : 'none'}, session: ${req.isAuthenticated()}`);

  if (req.isAuthenticated()) {
    return next();
  }

  // Try Basic or Bearer authentication
  return passport.authenticate(['basic', 'bearer'], { session: false }, (err: Error | null, user: Express.User | false, info: unknown) => {
    console.log(`[REST Auth] passport result - err: ${err}, user: ${!!user}, info: ${JSON.stringify(info)}`);
    if (err) return next(err);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.logIn(user, { session: false }, (loginErr) => {
      if (loginErr) return next(loginErr);
      return next();
    });
  })(req, res, next);
};

/**
 * Create a guard that ensures user has a specific role
 *
 * @param role - Required role
 * @returns Middleware that checks user role
 */
function ensureRole(role: UserRole): RequestHandler {
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
function ensureGroup(group: UserGroup): RequestHandler {
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
 * Maximum body size for proxied requests (5 MB).
 */
const MAX_PROXY_BODY_SIZE = 5 * 1024 * 1024;

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
  let size = 0;
  let aborted = false;

  req.on('data', (chunk: Buffer | string) => {
    size += Buffer.byteLength(chunk);
    if (size > MAX_PROXY_BODY_SIZE) {
      aborted = true;
      req.removeAllListeners('data');
      req.resume();
      res.status(413).send('Request body too large');
      return;
    }
    data += typeof chunk === 'string' ? chunk : chunk.toString();
  });

  req.on('end', () => {
    if (aborted) return;
    req.rawBody = data;
    next();
  });

  req.on('error', (err) => {
    if (aborted) return;
    aborted = true;
    next(err);
  });
};
