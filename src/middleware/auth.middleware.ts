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

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { BasicStrategy } from 'passport-http';
import { Strategy as ClientPasswordStrategy } from 'passport-oauth2-client-password';
import { Strategy as BearerStrategy } from 'passport-http-bearer';
import type { AuthService } from '../services/auth.service';
import type { ILogger } from '../types/notification';

/**
 * Configure Passport.js authentication strategies
 *
 * Sets up the following strategies:
 * - local: Username/password for web form logins
 * - basic: HTTP Basic auth for REST API
 * - oAuthBasic: HTTP Basic auth for OAuth2 client credentials
 * - oauth2-client-password: OAuth2 client password grant
 * - bearer: OAuth2 bearer token authentication
 *
 * @param authService - The authentication service
 * @param logger - Logger instance
 */
export function configurePassport(authService: AuthService, logger: ILogger): void {
  // Local authentication strategy for web logins
  passport.use(
    new LocalStrategy(
      { usernameField: 'username' },
      async (username, password, done) => {
        try {
          const result = await authService.validateCredentials(username, password);

          if (!result.user) {
            return done(null, false, result.message);
          }

          // Cast to Express.User - the Mongoose model has the openhab method
          return done(null, result.user as Express.User);
        } catch (error) {
          logger.error('Local strategy error:', error);
          return done(error);
        }
      }
    )
  );

  // Standard HTTP Basic authentication for REST API
  passport.use(
    new BasicStrategy(async (username, password, done) => {
      try {
        const result = await authService.validateCredentials(username, password);

        if (!result.user) {
          // BasicStrategy doesn't support info message, just return false
          return done(null, false);
        }

        return done(null, result.user);
      } catch (error) {
        logger.error('Basic strategy error:', error);
        return done(error);
      }
    })
  );

  // OAuth2 client authentication via HTTP Basic (for authorize endpoint)
  passport.use(
    'oAuthBasic',
    new BasicStrategy(async (clientId, clientSecret, done) => {
      try {
        const client = await authService.validateOAuth2Client(clientId, clientSecret);

        if (!client) {
          return done(null, false);
        }

        return done(null, client);
      } catch (error) {
        logger.error('OAuth Basic strategy error:', error);
        return done(error);
      }
    })
  );

  // OAuth2 client password strategy (for token endpoint)
  passport.use(
    new ClientPasswordStrategy(async (clientId, clientSecret, done) => {
      try {
        const client = await authService.validateOAuth2Client(clientId, clientSecret);

        if (!client) {
          return done(null, false);
        }

        return done(null, client);
      } catch (error) {
        logger.error('Client password strategy error:', error);
        return done(error);
      }
    })
  );

  // Bearer token strategy for API authentication
  passport.use(
    new BearerStrategy(async (accessToken, done) => {
      try {
        const result = await authService.validateBearerToken(accessToken);

        if (!result) {
          return done(null, false);
        }

        // Pass scopes as info object (third parameter)
        return done(null, result.user, { scope: result.scopes });
      } catch (error) {
        logger.error('Bearer strategy error:', error);
        return done(error);
      }
    })
  );

  // Session serialization - store user ID in session
  passport.serializeUser((user, done) => {
    done(null, user._id.toString());
  });

  // Session deserialization - fetch user from ID
  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await authService.findUserById(id);
      // Cast to Express.User - the Mongoose model has the openhab method
      done(null, user as Express.User | null);
    } catch (error) {
      logger.error('Deserialize user error:', error);
      done(error);
    }
  });
}
