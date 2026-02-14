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

// User & Account
export { User, type UserModel } from './user.model';
export { UserAccount, createUserAccount, type UserAccountModel } from './user-account.model';

// OpenHAB
export { Openhab, type OpenhabModel } from './openhab.model';

// Devices
export { UserDevice, type UserDeviceModel } from './user-device.model';

// Notifications
export { Notification, type NotificationModel } from './notification.model';

// OAuth2
export {
  OAuth2Client,
  OAuth2Token,
  OAuth2Code,
  OAuth2Scope,
  type OAuth2ClientModel,
  type OAuth2TokenModel,
  type OAuth2CodeModel,
  type OAuth2ScopeModel,
} from './oauth2.model';

// Events & Items
export { Event, type EventModel } from './event.model';
export { Item, type ItemModel } from './item.model';

// Verification & Invitations
export {
  EmailVerification,
  Invitation,
  LostPassword,
  type EmailVerificationModel,
  type InvitationModel,
  type LostPasswordModel,
} from './verification.model';

// Enrollment
export { Enrollment, type EnrollmentModel } from './enrollment.model';

// Re-export all types
export type * from '../types/models';
