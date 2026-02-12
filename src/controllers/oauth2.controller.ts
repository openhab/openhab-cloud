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

import type { RequestHandler, Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import type { Types } from 'mongoose';
import type { IOAuth2Client, IOAuth2Code, IOAuth2Token, IOAuth2Scope, IUser } from '../types/models';
import type { ILogger } from '../types/notification';
import oauth2orize from 'oauth2orize';
import crypto from 'crypto';

/**
 * Repository interface for OAuth2Client operations
 */
export interface IOAuth2ClientRepositoryForOAuth2 {
  findById(id: string | Types.ObjectId): Promise<IOAuth2Client | null>;
  findByClientId(clientId: string): Promise<IOAuth2Client | null>;
}

/**
 * Repository interface for OAuth2Code operations
 */
export interface IOAuth2CodeRepositoryForOAuth2 {
  create(data: {
    user: Types.ObjectId | string;
    oAuthClient: Types.ObjectId | string;
    code: string;
    redirectURI: string;
    scope: string[];
  }): Promise<IOAuth2Code>;
  findByCodeAndClientAndRedirect(
    code: string,
    clientId: Types.ObjectId | string,
    redirectURI: string
  ): Promise<IOAuth2Code | null>;
  invalidate(id: string | Types.ObjectId): Promise<void>;
}

/**
 * Repository interface for OAuth2Token operations
 */
export interface IOAuth2TokenRepositoryForOAuth2 {
  create(data: {
    token: string;
    user: Types.ObjectId | string;
    oAuthClient: Types.ObjectId | string;
    scope: string[];
  }): Promise<IOAuth2Token>;
}

/**
 * Repository interface for OAuth2Scope operations
 */
export interface IOAuth2ScopeRepositoryForOAuth2 {
  findByName(name: string): Promise<IOAuth2Scope | null>;
}

/**
 * Generate a cryptographically secure random string
 */
function generateUid(length: number): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

// Extended request type for oauth2orize
interface OAuth2Request extends Request {
  oauth2?: {
    client: IOAuth2Client;
    user: IUser;
    transactionID: string;
    redirectURI: string;
    req: {
      clientID: string;
      redirectURI: string;
      scope: string | string[];
      state: string;
      type: string;
      transactionID: string;
    };
  };
}

// Type for the ares parameter in grant.code callback
interface AuthorizationResponse {
  scope?: string | string[];
}

// Helper to normalize scope to array
function normalizeScope(scope: string | string[] | undefined): string[] {
  if (Array.isArray(scope)) {
    return scope;
  }
  if (scope) {
    return scope.split(' ').filter(s => s.length > 0);
  }
  return [];
}

/**
 * OAuth2 Controller
 *
 * Handles OAuth2 authorization server endpoints using oauth2orize:
 * - Authorization endpoint
 * - Token endpoint
 */
export class OAuth2Controller {
  private server: oauth2orize.OAuth2Server;

  constructor(
    private readonly oauth2ClientRepository: IOAuth2ClientRepositoryForOAuth2,
    private readonly oauth2CodeRepository: IOAuth2CodeRepositoryForOAuth2,
    private readonly oauth2TokenRepository: IOAuth2TokenRepositoryForOAuth2,
    private readonly oauth2ScopeRepository: IOAuth2ScopeRepositoryForOAuth2,
    private readonly logger: ILogger
  ) {
    this.server = oauth2orize.createServer();
    this.initializeServer();
  }

  /**
   * Initialize the oauth2orize server with serialization and grants
   */
  private initializeServer(): void {
    // Serialize client for session storage
    this.server.serializeClient((client: IOAuth2Client, done) => {
      return done(null, client._id.toString());
    });

    // Deserialize client from session
    this.server.deserializeClient((id: string, done) => {
      this.oauth2ClientRepository
        .findById(id)
        .then((client) => {
          if (!client) {
            return done(new Error('Client not found'));
          }
          return done(null, client);
        })
        .catch((error) => {
          this.logger.error('deserializeClient error:', error);
          return done(error as Error);
        });
    });

    // Grant authorization codes
    // Type assertion needed due to oauth2orize types not matching runtime behavior
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grantCodeFn = (
      client: any,
      redirectURI: string,
      user: any,
      ares: AuthorizationResponse,
      done: (err: Error | null, code?: string) => void
    ) => {
      const typedClient = client as IOAuth2Client;
      const typedUser = user as IUser;
      const scope = normalizeScope(ares.scope);
      const code = generateUid(32);

      this.oauth2CodeRepository
        .create({
          user: typedUser._id,
          oAuthClient: typedClient._id,
          code,
          redirectURI,
          scope,
        })
        .then(() => done(null, code))
        .catch((error) => {
          this.logger.error('grant.code error:', error);
          done(error as Error);
        });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.server.grant(oauth2orize.grant.code(grantCodeFn as any));

    // Exchange authorization codes for tokens
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const exchangeCodeFn = (
      client: any,
      code: string,
      redirectURI: string,
      done: (err: Error | null, token?: string | false) => void
    ) => {
      const typedClient = client as IOAuth2Client;

      this.oauth2CodeRepository
        .findByCodeAndClientAndRedirect(code, typedClient._id, redirectURI)
        .then(async (oauth2code) => {
          if (!oauth2code) {
            return done(null, false);
          }

          // Create new token
          const token = generateUid(256);
          await this.oauth2TokenRepository.create({
            token,
            user: oauth2code.user,
            oAuthClient: oauth2code.oAuthClient,
            scope: oauth2code.scope,
          });

          // Invalidate the used code
          await this.oauth2CodeRepository.invalidate(oauth2code._id);

          done(null, token);
        })
        .catch((error) => {
          this.logger.error('exchange.code error:', error);
          done(error as Error);
        });
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.server.exchange(oauth2orize.exchange.code(exchangeCodeFn as any));
  }

  /**
   * GET /oauth2/authorize
   *
   * Authorization endpoint - shows dialog asking user to grant access.
   */
  get authorization(): RequestHandler[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validateFn = (
      clientId: string,
      redirectURI: string,
      done: (err: Error | null, client?: any, redirectURI?: string) => void
    ) => {
      this.oauth2ClientRepository
        .findByClientId(clientId)
        .then((client) => {
          if (!client) {
            return done(null, false);
          }
          return done(null, client, redirectURI);
        })
        .catch((error) => {
          this.logger.error('authorization error:', error);
          return done(error as Error);
        });
    };

    const authorizationMiddleware = this.server.authorization(validateFn as unknown as oauth2orize.ValidateFunction);

    const renderDialog: RequestHandler = (req: Request, res: Response) => {
      const oauth2Req = req as OAuth2Request;
      if (!oauth2Req.oauth2) {
        req.flash('error', 'Invalid OAuth2 request');
        return res.redirect('/');
      }

      const scopeValue = oauth2Req.oauth2.req.scope;
      const scopeName = Array.isArray(scopeValue) ? scopeValue[0] : scopeValue;

      this.logger.info(`OAuth2 authorization request for scope: ${scopeName}`);

      if (!scopeName) {
        req.flash('info', 'The application requested access to unknown scope');
        return res.redirect('/');
      }

      this.oauth2ScopeRepository
        .findByName(scopeName)
        .then((scope) => {
          if (!scope) {
            req.flash('info', 'The application requested access to unknown scope');
            return res.redirect('/');
          }

          res.render('oauth2dialog', {
            title: 'openHAB',
            user: req.user,
            errormessages: req.flash('error'),
            infomessages: req.flash('info'),
            transactionID: oauth2Req.oauth2!.transactionID,
            oauthClient: oauth2Req.oauth2!.client,
            scope,
          });
        })
        .catch((error) => {
          this.logger.error('authorization render error:', error);
          req.flash('error', 'There was an error while processing your request');
          res.redirect('/');
        });
    };

    return [authorizationMiddleware as unknown as RequestHandler, renderDialog];
  }

  /**
   * POST /oauth2/authorize/decision
   *
   * User's decision on the authorization request.
   */
  get decision(): RequestHandler[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parseFn = (req: any, done: (err: Error | null, result?: { scope?: string[] }) => void) => {
      const oauth2Req = req as OAuth2Request;
      const scope = oauth2Req.oauth2?.req.scope;
      const scopeArr = normalizeScope(scope);
      return done(null, { scope: scopeArr });
    };

    const decisionMiddleware = this.server.decision(parseFn as unknown as oauth2orize.DecisionParseFunction);

    return [decisionMiddleware as unknown as RequestHandler];
  }

  /**
   * POST /oauth2/token
   *
   * Token endpoint - exchanges authorization codes for access tokens.
   * Requires client authentication via Basic auth or client_password grant.
   */
  get token(): (RequestHandler | ErrorRequestHandler)[] {
    return [
      this.server.token() as unknown as RequestHandler,
      this.server.errorHandler() as unknown as ErrorRequestHandler,
    ];
  }

  /**
   * Get the oauth2orize server instance for middleware integration
   */
  getServer(): oauth2orize.OAuth2Server {
    return this.server;
  }
}
