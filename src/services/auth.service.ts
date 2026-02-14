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

import crypto from 'crypto';
import type { Types } from 'mongoose';
import type {
  IUser,
  IOpenhab,
  IOAuth2Client,
  IOAuth2Token,
} from '../types/models';
import type { ILogger } from '../types/notification';

/**
 * Result of bearer token validation
 */
export interface BearerTokenResult {
  user: IUser;
  scopes: string[];
}

/**
 * Repository interface for User model
 */
export interface IUserRepository {
  findById(id: string | Types.ObjectId): Promise<IUser | null>;
  findByUsername(username: string): Promise<IUser | null>;
  authenticate(username: string, password: string): Promise<{
    user: IUser | null;
    error?: Error;
    message?: { message: string };
  }>;
}

/**
 * Repository interface for OAuth2Client model
 */
export interface IOAuth2ClientRepository {
  findByClientId(clientId: string): Promise<IOAuth2Client | null>;
}

/**
 * Repository interface for OAuth2Token model
 */
export interface IOAuth2TokenRepository {
  findByToken(token: string): Promise<IOAuth2Token | null>;
}

/**
 * Repository interface for Openhab model
 */
export interface IOpenhabRepository {
  findByAccount(accountId: string | Types.ObjectId): Promise<IOpenhab | null>;
}

/**
 * Authentication Service
 *
 * Provides authentication logic for various strategies:
 * - Local (username/password for web logins)
 * - Basic (username/password for REST API)
 * - OAuth2 Client (client credentials)
 * - Bearer Token (OAuth2 access tokens)
 */
export class AuthService {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly oauth2ClientRepository: IOAuth2ClientRepository,
    private readonly oauth2TokenRepository: IOAuth2TokenRepository,
    private readonly logger: ILogger
  ) {}

  /**
   * Validate user credentials (for Local and Basic strategies)
   *
   * @param username - User's email/username
   * @param password - User's password
   * @returns User if valid, null if invalid, or error info
   */
  async validateCredentials(
    username: string,
    password: string
  ): Promise<{ user: IUser | null; message?: { message: string } }> {
    try {
      const result = await this.userRepository.authenticate(username, password);

      if (result.error) {
        this.logger.error('Authentication error:', result.error);
        return { user: null };
      }

      if (!result.user && result.message) {
        this.logger.debug(`Authentication failed for ${username}: ${result.message.message}`);
        return { user: null, message: result.message };
      }

      return { user: result.user ?? null, message: result.message };
    } catch (error) {
      this.logger.error('Authentication exception:', error);
      return { user: null };
    }
  }

  /**
   * Validate OAuth2 client credentials (for oAuthBasic and ClientPassword strategies)
   *
   * @param clientId - OAuth2 client ID
   * @param clientSecret - OAuth2 client secret
   * @returns OAuth2Client if valid, null if invalid
   */
  async validateOAuth2Client(
    clientId: string,
    clientSecret: string
  ): Promise<IOAuth2Client | null> {
    try {
      const client = await this.oauth2ClientRepository.findByClientId(clientId);

      if (!client) {
        this.logger.debug(`OAuth2 client not found: ${clientId}`);
        return null;
      }

      // Use timing-safe comparison to prevent timing attacks
      const secretBuffer = Buffer.from(clientSecret);
      const storedBuffer = Buffer.from(client.clientSecret);
      if (secretBuffer.length !== storedBuffer.length ||
          !crypto.timingSafeEqual(secretBuffer, storedBuffer)) {
        this.logger.debug(`Invalid client secret for: ${clientId}`);
        return null;
      }

      if (!client.active) {
        this.logger.debug(`OAuth2 client is inactive: ${clientId}`);
        return null;
      }

      this.logger.debug(`OAuth2 client authenticated: ${clientId}`);
      return client;
    } catch (error) {
      this.logger.error('OAuth2 client authentication error:', error);
      return null;
    }
  }

  /**
   * Validate bearer token (for Bearer strategy)
   *
   * @param accessToken - OAuth2 access token
   * @returns User and scopes if valid, null if invalid
   */
  async validateBearerToken(accessToken: string): Promise<BearerTokenResult | null> {
    try {
      const token = await this.oauth2TokenRepository.findByToken(accessToken);

      if (!token) {
        this.logger.info('[OAuth2] Bearer token not found');
        return null;
      }

      if (!token.valid) {
        this.logger.info('[OAuth2] Bearer token is invalid/revoked');
        return null;
      }

      const user = await this.userRepository.findById(token.user.toString());

      if (!user) {
        this.logger.info(`[OAuth2] User not found for bearer token, userId=${token.user.toString()}`);
        return null;
      }

      if (!user.active) {
        this.logger.info(`[OAuth2] User ${user.username} is inactive`);
        return null;
      }

      this.logger.info(`[OAuth2] Bearer token validated for user: ${user.username}`);
      return {
        user,
        scopes: token.scope,
      };
    } catch (error) {
      this.logger.error('Bearer token validation error:', error);
      return null;
    }
  }

  /**
   * Find user by ID (for session deserialization)
   *
   * @param id - User ID
   * @returns User if found, null otherwise
   */
  async findUserById(id: string | Types.ObjectId): Promise<IUser | null> {
    try {
      return await this.userRepository.findById(id);
    } catch (error) {
      this.logger.error('User lookup error:', error);
      return null;
    }
  }
}
