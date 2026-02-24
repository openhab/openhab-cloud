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
 * Service Factory
 *
 * Creates and wires up all services with their dependencies.
 * Uses legacy Mongoose models through adapter implementations.
 */

import type { AppLogger } from '../lib/logger';
import type { SystemConfigManager } from '../config';
import type { IUser } from '../types/models';

// Services
import { UserService, AuthService, OpenhabService, createEmailService, EmailService, NotificationService } from '../services';
import { FCMProvider } from '../lib/push/fcm.provider';
import type { INotificationRepository, IUserDeviceRepository, INotificationService } from '../types/notification';

// Service interfaces
import type {
  IUserRepositoryForService,
  IUserAccountRepository,
  IOpenhabRepositoryForService,
  ILostPasswordRepository,
  IEmailVerificationRepository,
  ICascadeDeleteRepositories,
  IPasswordValidator,
  IEmailService,
  UserServiceConfig,
} from '../services/user.service';

import type {
  IUserRepository,
  IOAuth2ClientRepository,
  IOAuth2TokenRepository,
} from '../services/auth.service';

import type { IOpenhabRepositoryFull } from '../services/openhab.service';

import {
  User,
  UserAccount,
  Openhab,
  LostPassword,
  EmailVerification,
  OAuth2Client,
  OAuth2Token,
  Item,
  Event,
  Notification,
  UserDevice,
} from '../models';

/**
 * Factory dependencies
 */
export interface ServiceFactoryDeps {
  configManager: SystemConfigManager;
  logger: AppLogger;
}

/**
 * Created services container
 */
export interface ServiceContainer {
  userService: UserService;
  authService: AuthService;
  openhabService: OpenhabService;
  emailService: EmailService;
  notificationService: INotificationService;
  fcmProvider: FCMProvider;
  passwordValidator: IPasswordValidator;
}

/**
 * Create user repository adapter from legacy model
 *
 * Note: The legacy User model uses a virtual property setter for passwords,
 * not a setPassword method. Password is set via `user.password = value`.
 */
function createUserRepository(): IUserRepositoryForService {
  return {
    findById: async (id) => User.findById(id),
    findByUsername: async (username) => User.findOne({ username }),
    findByAccount: async (accountId) => User.find({ account: accountId }),
    register: async (username, password) => {
      // Use the TypeScript model's async register method which creates
      // both UserAccount and User atomically with proper linkage
      return User.register(username, password);
    },
    updateVerifiedEmail: async (userId, verified) => {
      await User.findByIdAndUpdate(userId, { verifiedEmail: verified });
    },
    deleteByAccount: async (accountId) => {
      await User.deleteMany({ account: accountId });
    },
    setPassword: async (userId, password) => {
      const user = await User.findById(userId);
      if (!user) return false;
      // Use virtual property setter to trigger hash generation
      (user as unknown as { password: string }).password = password;
      await user.save();
      return true;
    },
    checkPassword: async (userId, password) => {
      const user = await User.findById(userId);
      if (!user) return false;
      // TypeScript model uses async checkPassword
      return user.checkPassword(password);
    },
  };
}

/**
 * Create user account repository adapter from legacy model
 */
function createUserAccountRepository(): IUserAccountRepository {
  return {
    findById: async (id) => UserAccount.findById(id),
    deleteById: async (id) => {
      await UserAccount.findByIdAndDelete(id);
    },
  };
}

/**
 * Create openHAB repository adapter from legacy model (for UserService)
 */
function createOpenhabRepositoryForService(): IOpenhabRepositoryForService {
  return {
    findByUuid: async (uuid) => Openhab.findOne({ uuid }),
    findByAccount: async (accountId) => Openhab.findOne({ account: accountId }),
    create: async (data) => {
      const openhab = new Openhab(data);
      return openhab.save();
    },
    deleteByAccount: async (accountId) => {
      await Openhab.deleteMany({ account: accountId });
    },
  };
}

/**
 * Create full openHAB repository adapter (for OpenhabService)
 */
function createOpenhabRepositoryFull(): IOpenhabRepositoryFull {
  return {
    findByUuid: async (uuid) => Openhab.findOne({ uuid }),
    create: async (data) => {
      const openhab = new Openhab(data);
      return openhab.save();
    },
    updateUuidAndSecret: async (id, uuid, secret) => {
      await Openhab.findByIdAndUpdate(id, { uuid, secret });
    },
  };
}

/**
 * Create lost password repository adapter from legacy model
 */
function createLostPasswordRepository(): ILostPasswordRepository {
  return {
    findByCode: async (code) => LostPassword.findOne({ recoveryCode: code }),
    create: async (data) => {
      const lp = new LostPassword(data);
      return lp.save();
    },
    markUsed: async (id) => {
      await LostPassword.findByIdAndUpdate(id, { used: true });
    },
  };
}

/**
 * Create email verification repository adapter from legacy model
 */
function createEmailVerificationRepository(): IEmailVerificationRepository {
  return {
    findByCode: async (code) => EmailVerification.findOne({ code }),
    create: async (data) => {
      const ev = new EmailVerification(data);
      return ev.save();
    },
    markUsed: async (id) => {
      await EmailVerification.findByIdAndUpdate(id, { used: true });
    },
  };
}

/**
 * Create cascade delete repositories adapter
 */
function createCascadeDeleteRepositories(): ICascadeDeleteRepositories {
  return {
    deleteItemsByOpenhab: async (openhabId) => {
      await Item.deleteMany({ openhab: openhabId });
    },
    deleteEventsByOpenhab: async (openhabId) => {
      await Event.deleteMany({ openhab: openhabId });
    },
    deleteDevicesByOwner: async (userId) => {
      await UserDevice.deleteMany({ owner: userId });
    },
    deleteNotificationsByUser: async (userId) => {
      await Notification.deleteMany({ user: userId });
    },
    deleteOAuth2TokensByUser: async (userId) => {
      await OAuth2Token.deleteMany({ user: userId });
    },
  };
}

/**
 * Create OAuth2 client repository adapter
 */
function createOAuth2ClientRepository(): IOAuth2ClientRepository {
  return {
    findByClientId: async (clientId) => OAuth2Client.findOne({ clientId }),
  };
}

/**
 * Create OAuth2 token repository adapter
 */
function createOAuth2TokenRepository(): IOAuth2TokenRepository {
  return {
    findByToken: async (token) => OAuth2Token.findOne({ token }),
  };
}

/**
 * Create user repository for AuthService
 */
function createUserRepositoryForAuth(): IUserRepository {
  return {
    findById: async (id) => User.findById(id),
    findByUsername: async (username) => User.findOne({ username }),
    authenticate: async (username, password) => {
      const user = await User.findOne({ username: username.toLowerCase() });
      if (!user) {
        // Use generic message to prevent user enumeration
        return { user: null, message: { message: 'Unknown user or incorrect password' } };
      }
      // TypeScript model uses async checkPassword
      const isValid = await user.checkPassword(password);
      if (!isValid) {
        return { user: null, message: { message: 'Unknown user or incorrect password' } };
      }
      // Check if user account is active (matches legacy model behavior)
      if (!user.active) {
        return { user: null, message: { message: 'User is not active' } };
      }
      return { user };
    },
  };
}

/**
 * Default password validator
 *
 * Enforces:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 */
function createPasswordValidator(): IPasswordValidator {
  const MIN_LENGTH = 8;

  return {
    isComplexEnough: (password) => {
      if (password.length < MIN_LENGTH) return false;
      if (!/[A-Z]/.test(password)) return false;
      if (!/[a-z]/.test(password)) return false;
      if (!/[0-9]/.test(password)) return false;
      return true;
    },
    getComplexityError: () => {
      return `Password must be at least ${MIN_LENGTH} characters and contain uppercase, lowercase, and a digit`;
    },
  };
}

/**
 * Create email service adapter (implements IEmailService for UserService)
 */
function createEmailServiceAdapter(emailService: EmailService): IEmailService {
  return {
    sendPasswordReset: async (email, resetUrl) => {
      await emailService.sendPasswordReset(email, resetUrl);
    },
    sendEmailVerification: async (email, verifyUrl) => {
      await emailService.sendEmailVerification(email, verifyUrl);
    },
  };
}

/**
 * Create notification repository adapter from legacy model
 */
function createNotificationRepository(): INotificationRepository {
  return {
    create: async (data) => {
      const notification = new Notification(data);
      return notification.save();
    },
  };
}

/**
 * Create user device repository adapter for notification service
 */
function createUserDeviceRepository(): IUserDeviceRepository {
  return {
    findByOwner: async (ownerId) => UserDevice.find({ owner: ownerId }),
  };
}

/**
 * Create all services with their dependencies wired up
 */
export function createServices(deps: ServiceFactoryDeps): ServiceContainer {
  const { configManager, logger } = deps;

  // Create email service
  const mailerConfig = configManager.getMailerConfig();
  const emailService = createEmailService(
    {
      mailer: mailerConfig
        ? {
            host: mailerConfig.host,
            port: mailerConfig.port,
            secureConnection: mailerConfig.secureConnection,
            user: mailerConfig.user,
            password: mailerConfig.password,
            from: mailerConfig.from || 'noreply@openhab.org',
          }
        : undefined,
    },
    logger
  );

  // Create repositories
  const userRepository = createUserRepository();
  const userAccountRepository = createUserAccountRepository();
  const openhabRepositoryForService = createOpenhabRepositoryForService();
  const lostPasswordRepository = createLostPasswordRepository();
  const emailVerificationRepository = createEmailVerificationRepository();
  const cascadeDelete = createCascadeDeleteRepositories();
  const passwordValidator = createPasswordValidator();

  // UserService config
  const userServiceConfig: UserServiceConfig = {
    baseUrl: configManager.getBaseURL(),
    registrationEnabled: configManager.isUserRegistrationEnabled(),
  };

  // Create email service adapter for UserService
  const emailServiceAdapter = createEmailServiceAdapter(emailService);

  // Create UserService
  const userService = new UserService(
    userRepository,
    userAccountRepository,
    openhabRepositoryForService,
    lostPasswordRepository,
    emailVerificationRepository,
    cascadeDelete,
    emailServiceAdapter,
    passwordValidator,
    userServiceConfig,
    logger
  );

  // Create AuthService
  const userRepositoryForAuth = createUserRepositoryForAuth();
  const oauth2ClientRepository = createOAuth2ClientRepository();
  const oauth2TokenRepository = createOAuth2TokenRepository();

  const authService = new AuthService(
    userRepositoryForAuth,
    oauth2ClientRepository,
    oauth2TokenRepository,
    logger
  );

  // Create OpenhabService
  const openhabRepositoryFull = createOpenhabRepositoryFull();
  const openhabService = new OpenhabService(openhabRepositoryFull, logger);

  // Create NotificationService
  const gcmConfigured = configManager.isGcmConfigured();
  logger.info(`GCM/FCM configured: ${gcmConfigured}`);
  const fcmConfig = gcmConfigured
    ? { serviceAccountPath: configManager.getFirebaseServiceFile() }
    : null;
  if (fcmConfig) {
    logger.info(`FCM service file path: ${fcmConfig.serviceAccountPath}`);
  }
  const fcmProvider = new FCMProvider(fcmConfig, logger);
  const notificationRepository = createNotificationRepository();
  const userDeviceRepository = createUserDeviceRepository();
  const notificationService = new NotificationService(
    notificationRepository,
    userDeviceRepository,
    fcmProvider,
    logger
  );

  return {
    userService,
    authService,
    openhabService,
    emailService,
    notificationService,
    fcmProvider,
    passwordValidator,
  };
}
