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
 * Minimum config shape required by createBrowserAwareAuthenticated.
 */
export interface BrowserAwareAuthConfig {
  getHost(): string;
}

/**
 * Minimum config shape required by createApplyReturnTo. Names the set of
 * hostnames this deployment actively serves; any returnTo that resolves
 * outside this set is rejected.
 */
export interface ReturnToHostConfig {
  getHost(): string;
  getProxyHost(): string;
  getBrowserProxyHost(): string | undefined;
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
 * Create a guard that redirects unauthenticated browser navigations to the
 * main-site login page while leaving API/WebView clients on the HTTP Basic
 * challenge path.
 *
 * A request is treated as a browser navigation when it is a GET and carries
 * Fetch Metadata headers typical of a top-level document load
 * (Sec-Fetch-Dest: document or Sec-Fetch-Mode: navigate) or prefers HTML via
 * content negotiation. XHR, fetch() requests with Accept: application/json,
 * CORS preflights, and non-idempotent methods fall through to Basic/Bearer
 * authentication with no behavior change.
 *
 * The login target is the main host (configManager.getHost()); the original
 * absolute URL is passed as an encoded returnTo query parameter for the login
 * controller to validate against known hosts before honoring.
 */
export function createBrowserAwareAuthenticated(
  configManager: BrowserAwareAuthConfig
): RequestHandler {
  return (req, res, next) => {
    if (req.isAuthenticated()) {
      return next();
    }

    // Prefer Fetch Metadata when present. Fall back to content negotiation —
    // listing 'json' first so clients sending `Accept: */*` (e.g. curl) are
    // treated as API clients, while browsers (which explicitly include
    // text/html at quality 1.0) still resolve to 'html'.
    const looksLikeBrowserNav =
      req.method === 'GET' &&
      (req.get('sec-fetch-dest') === 'document' ||
        req.get('sec-fetch-mode') === 'navigate' ||
        req.accepts(['json', 'html']) === 'html');

    if (looksLikeBrowserNav) {
      const proto = req.protocol;
      const target = `${proto}://${req.hostname}${req.originalUrl}`;
      return res.redirect(
        `${proto}://${configManager.getHost()}/login?returnTo=${encodeURIComponent(target)}`
      );
    }

    return passport.authenticate(['basic', 'bearer'], { session: false })(req, res, next);
  };
}

/**
 * Create middleware that accepts a returnTo value from query or body and, when
 * it points at a host this deployment actively serves, persists it as
 * req.session.returnTo so passport's successReturnToOrRedirect honors it.
 *
 * Absolute URLs outside the allowed hostnames are ignored to prevent open
 * redirects. Invalid URLs are ignored silently.
 */
export function createApplyReturnTo(config: ReturnToHostConfig): RequestHandler {
  return (req, _res, next) => {
    const fromQuery = req.query['returnTo'];
    const fromBody = (req.body as Record<string, unknown> | undefined)?.['returnTo'];
    const candidate =
      typeof fromQuery === 'string'
        ? fromQuery
        : typeof fromBody === 'string'
          ? fromBody
          : null;

    if (candidate) {
      try {
        const url = new URL(candidate);
        const hostname = url.hostname.toLowerCase();
        const allowed = [
          config.getHost(),
          config.getProxyHost(),
          config.getBrowserProxyHost(),
        ]
          .filter((h): h is string => typeof h === 'string' && h.length > 0)
          .map((h) => h.toLowerCase());
        if (allowed.includes(hostname)) {
          req.session.returnTo = url.toString();
        }
      } catch {
        // Invalid URL - ignore
      }
    }
    next();
  };
}

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
