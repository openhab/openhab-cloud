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

import { v4 as uuidv4 } from 'uuid';
import type { Types } from 'mongoose';
import type {
  IUser,
  IUserAccount,
  IOpenhab,
  ILostPassword,
  IEmailVerification,
} from '../types/models';
import type { ILogger } from '../types/notification';

/**
 * Result of user registration
 */
export interface RegistrationResult {
  success: boolean;
  user?: IUser;
  error?: string;
}

/**
 * Result of password operations
 */
export interface PasswordResult {
  success: boolean;
  error?: string;
}

/**
 * Data for user registration
 */
export interface RegisterUserData {
  username: string;
  password: string;
  openhabUuid: string;
  openhabSecret: string;
}

/**
 * Repository interface for User operations
 */
export interface IUserRepositoryForService {
  findById(id: string | Types.ObjectId): Promise<IUser | null>;
  findByUsername(username: string): Promise<IUser | null>;
  findByAccount(accountId: string | Types.ObjectId): Promise<IUser[]>;
  register(username: string, password: string): Promise<IUser>;
  updateVerifiedEmail(userId: string | Types.ObjectId, verified: boolean): Promise<void>;
  deleteByAccount(accountId: string | Types.ObjectId): Promise<void>;
  setPassword(userId: string | Types.ObjectId, password: string): Promise<boolean>;
  checkPassword(userId: string | Types.ObjectId, password: string): Promise<boolean>;
}

/**
 * Repository interface for UserAccount operations
 */
export interface IUserAccountRepository {
  findById(id: string | Types.ObjectId): Promise<IUserAccount | null>;
  deleteById(id: string | Types.ObjectId): Promise<void>;
}

/**
 * Repository interface for Openhab operations
 */
export interface IOpenhabRepositoryForService {
  findByUuid(uuid: string): Promise<IOpenhab | null>;
  findByAccount(accountId: string | Types.ObjectId): Promise<IOpenhab | null>;
  create(data: { account: Types.ObjectId | string; uuid: string; secret: string }): Promise<IOpenhab>;
  deleteByAccount(accountId: string | Types.ObjectId): Promise<void>;
}

/**
 * Repository interface for LostPassword operations
 */
export interface ILostPasswordRepository {
  findByCode(code: string): Promise<ILostPassword | null>;
  create(data: { user: Types.ObjectId | string; recoveryCode: string }): Promise<ILostPassword>;
  markUsed(id: string | Types.ObjectId): Promise<void>;
}

/**
 * Repository interface for EmailVerification operations
 */
export interface IEmailVerificationRepository {
  findByCode(code: string): Promise<IEmailVerification | null>;
  create(data: { user: Types.ObjectId | string; email: string; code: string }): Promise<IEmailVerification>;
  markUsed(id: string | Types.ObjectId): Promise<void>;
}

/**
 * Repository interface for cascading deletes
 */
export interface ICascadeDeleteRepositories {
  deleteItemsByOpenhab(openhabId: string | Types.ObjectId): Promise<void>;
  deleteEventsByOpenhab(openhabId: string | Types.ObjectId): Promise<void>;
  deleteDevicesByOwner(userId: string | Types.ObjectId): Promise<void>;
  deleteNotificationsByUser(userId: string | Types.ObjectId): Promise<void>;
  deleteOAuth2TokensByUser(userId: string | Types.ObjectId): Promise<void>;
}

/**
 * Email service interface
 */
export interface IEmailService {
  sendPasswordReset(email: string, resetUrl: string): Promise<void>;
  sendEmailVerification(email: string, verifyUrl: string): Promise<void>;
}

/**
 * Password validation interface
 */
export interface IPasswordValidator {
  isComplexEnough(password: string): boolean;
  getComplexityError(): string;
}

/**
 * Configuration for UserService
 */
export interface UserServiceConfig {
  baseUrl: string;
  registrationEnabled: boolean;
}

/**
 * User Service
 *
 * Handles user management operations:
 * - Registration
 * - Password reset/change
 * - Email verification
 * - Account deletion
 */
export class UserService {
  constructor(
    private readonly userRepository: IUserRepositoryForService,
    private readonly userAccountRepository: IUserAccountRepository,
    private readonly openhabRepository: IOpenhabRepositoryForService,
    private readonly lostPasswordRepository: ILostPasswordRepository,
    private readonly emailVerificationRepository: IEmailVerificationRepository,
    private readonly cascadeDelete: ICascadeDeleteRepositories,
    private readonly emailService: IEmailService,
    private readonly passwordValidator: IPasswordValidator,
    private readonly config: UserServiceConfig,
    private readonly logger: ILogger
  ) {}

  /**
   * Register a new user with their openHAB instance
   */
  async register(data: RegisterUserData): Promise<RegistrationResult> {
    if (!this.config.registrationEnabled) {
      return { success: false, error: 'Registration is currently disabled' };
    }

    // Check if username already exists
    const existingUser = await this.userRepository.findByUsername(data.username);
    if (existingUser) {
      return { success: false, error: 'A user with this e-mail is already registered' };
    }

    // Check if openHAB UUID is already in use
    const existingOpenhab = await this.openhabRepository.findByUuid(data.openhabUuid);
    if (existingOpenhab) {
      return { success: false, error: 'UUID is already in use on another account' };
    }

    // Validate password complexity
    if (!this.passwordValidator.isComplexEnough(data.password)) {
      return { success: false, error: this.passwordValidator.getComplexityError() };
    }

    try {
      // Register the user (creates User and UserAccount)
      const user = await this.userRepository.register(data.username, data.password);

      // Create the openHAB instance
      await this.openhabRepository.create({
        account: user.account,
        uuid: data.openhabUuid,
        secret: data.openhabSecret,
      });

      // Send email verification (don't await - fire and forget)
      this.sendEmailVerification(user).catch(error => {
        this.logger.error('Failed to send verification email:', error);
      });

      this.logger.info(`User registered: ${data.username}`);
      return { success: true, user };
    } catch (error) {
      this.logger.error('Registration error:', error);
      return { success: false, error: 'An error occurred during registration' };
    }
  }

  /**
   * Initiate password reset flow
   */
  async initiatePasswordReset(email: string): Promise<PasswordResult> {
    try {
      const user = await this.userRepository.findByUsername(email.toLowerCase());

      // Always return success to prevent user enumeration
      if (!user) {
        this.logger.debug(`Password reset requested for non-existent user: ${email}`);
        return { success: true };
      }

      const recoveryCode = uuidv4();
      await this.lostPasswordRepository.create({
        user: user._id,
        recoveryCode,
      });

      const resetUrl = `${this.config.baseUrl}/lostpasswordreset?resetCode=${recoveryCode}`;
      await this.emailService.sendPasswordReset(email, resetUrl);

      this.logger.info(`Password reset initiated for: ${email}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Password reset error:', error);
      return { success: false, error: 'An error occurred while processing your request' };
    }
  }

  /**
   * Complete password reset with recovery code
   */
  async resetPassword(recoveryCode: string, newPassword: string): Promise<PasswordResult> {
    try {
      const lostPassword = await this.lostPasswordRepository.findByCode(recoveryCode);

      if (!lostPassword || lostPassword.used) {
        return { success: false, error: 'Your password reset code is invalid or expired' };
      }

      // Validate password complexity
      if (!this.passwordValidator.isComplexEnough(newPassword)) {
        return { success: false, error: this.passwordValidator.getComplexityError() };
      }

      const user = await this.userRepository.findById(lostPassword.user.toString());
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const success = await this.userRepository.setPassword(user._id, newPassword);
      if (!success) {
        return { success: false, error: 'Failed to set new password' };
      }

      await this.lostPasswordRepository.markUsed(lostPassword._id);

      this.logger.info(`Password reset completed for: ${user.username}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Password reset completion error:', error);
      return { success: false, error: 'An error occurred while processing your request' };
    }
  }

  /**
   * Change password for authenticated user
   */
  async changePassword(
    userId: string | Types.ObjectId,
    oldPassword: string,
    newPassword: string
  ): Promise<PasswordResult> {
    try {
      // Verify old password
      const isCorrect = await this.userRepository.checkPassword(userId, oldPassword);
      if (!isCorrect) {
        return { success: false, error: "Old password isn't correct" };
      }

      // Validate new password complexity
      if (!this.passwordValidator.isComplexEnough(newPassword)) {
        return { success: false, error: this.passwordValidator.getComplexityError() };
      }

      const success = await this.userRepository.setPassword(userId, newPassword);
      if (!success) {
        return { success: false, error: 'Failed to set new password' };
      }

      this.logger.info(`Password changed for user: ${userId}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Password change error:', error);
      return { success: false, error: 'An error occurred while processing your request' };
    }
  }

  /**
   * Send email verification to user
   */
  async sendEmailVerification(user: IUser): Promise<void> {
    const code = uuidv4();

    await this.emailVerificationRepository.create({
      user: user._id,
      email: user.username,
      code,
    });

    const verifyUrl = `${this.config.baseUrl}/verify?code=${code}`;
    await this.emailService.sendEmailVerification(user.username, verifyUrl);

    this.logger.info(`Verification email sent to: ${user.username}`);
  }

  /**
   * Verify user's email with verification code
   */
  async verifyEmail(code: string): Promise<PasswordResult> {
    try {
      const verification = await this.emailVerificationRepository.findByCode(code);

      if (!verification || verification.used) {
        return { success: false, error: 'Invalid verification code' };
      }

      const user = await this.userRepository.findById(verification.user.toString());
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      await this.emailVerificationRepository.markUsed(verification._id);
      await this.userRepository.updateVerifiedEmail(user._id, true);

      this.logger.info(`Email verified for: ${user.username}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Email verification error:', error);
      return { success: false, error: 'Verification error occurred' };
    }
  }

  /**
   * Delete user account and all associated data
   *
   * WARNING: This permanently deletes all user data!
   */
  async deleteAccount(userId: string | Types.ObjectId): Promise<PasswordResult> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const userAccount = await this.userAccountRepository.findById(user.account.toString());
      if (!userAccount) {
        return { success: false, error: 'Account not found' };
      }

      const openhab = await this.openhabRepository.findByAccount(userAccount._id);

      this.logger.info(`Deleting account for: ${user.username}`);

      // Delete in order to maintain referential integrity
      if (openhab) {
        await this.cascadeDelete.deleteItemsByOpenhab(openhab._id);
        await this.cascadeDelete.deleteEventsByOpenhab(openhab._id);
      }

      await this.cascadeDelete.deleteDevicesByOwner(userId);
      await this.cascadeDelete.deleteNotificationsByUser(userId);
      await this.cascadeDelete.deleteOAuth2TokensByUser(userId);

      if (openhab) {
        await this.openhabRepository.deleteByAccount(userAccount._id);
      }

      await this.userRepository.deleteByAccount(userAccount._id);
      await this.userAccountRepository.deleteById(userAccount._id);

      this.logger.info(`Account deleted for: ${user.username}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Account deletion error:', error);
      return { success: false, error: 'An error occurred during operation' };
    }
  }

  /**
   * Delete items and events for user's openHAB (but keep account)
   */
  async deleteItemsAndEvents(userId: string | Types.ObjectId): Promise<PasswordResult> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      const openhab = await this.openhabRepository.findByAccount(user.account.toString());
      if (!openhab) {
        return { success: false, error: 'openHAB not found' };
      }

      await this.cascadeDelete.deleteEventsByOpenhab(openhab._id);
      await this.cascadeDelete.deleteItemsByOpenhab(openhab._id);

      this.logger.info(`Items and events deleted for user: ${user.username}`);
      return { success: true };
    } catch (error) {
      this.logger.error('Delete items/events error:', error);
      return { success: false, error: 'An error occurred while processing your request' };
    }
  }
}
