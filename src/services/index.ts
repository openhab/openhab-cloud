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

export { NotificationService, PayloadTooLargeError } from './notification.service';
export { AuthService } from './auth.service';
export { UserService } from './user.service';
export { OpenhabService } from './openhab.service';
export { EmailService, createEmailService } from './email.service';
export type {
  BearerTokenResult,
  IUserRepository,
  IOAuth2ClientRepository,
  IOAuth2TokenRepository,
  IOpenhabRepository,
} from './auth.service';
export type {
  RegistrationResult,
  PasswordResult,
  RegisterUserData,
  IUserRepositoryForService,
  IUserAccountRepository,
  IOpenhabRepositoryForService,
  ILostPasswordRepository,
  IEmailVerificationRepository,
  ICascadeDeleteRepositories,
  IEmailService,
  IPasswordValidator,
  UserServiceConfig,
} from './user.service';
export type {
  IOpenhabRepositoryFull,
  OpenhabAuthResult,
} from './openhab.service';
export type {
  SmtpConfig,
  EmailServiceConfig,
  PasswordResetLocals,
  EmailVerificationLocals,
  InvitationLocals,
} from './email.service';
