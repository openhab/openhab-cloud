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

export { HealthController } from './health.controller';
export type { HealthControllerConfig } from './health.controller';

export { ApiController } from './api.controller';
export type {
  INotificationRepositoryForApi,
  IUserDeviceRepositoryForApi,
  IPushProviderForApi,
  ISystemConfig,
} from './api.controller';

export { AccountController } from './account.controller';
export type { IAccountSystemConfig } from './account.controller';

export { DevicesController } from './devices.controller';
export type {
  IUserDeviceRepositoryForDevices,
  INotificationRepositoryForDevices,
  IPushProviderForDevices,
  IDevicesSystemConfig,
} from './devices.controller';

export { InvitationsController } from './invitations.controller';
export type {
  IInvitationRepositoryForInvitations,
  IInvitationsSystemConfig,
} from './invitations.controller';

export { UsersController } from './users.controller';
export type {
  IUserRepositoryForUsers,
  IPasswordService,
} from './users.controller';

export { StaffController } from './staff.controller';
export type {
  IEnrollmentRepositoryForStaff,
  IInvitationRepositoryForStaff,
  IOAuth2ClientRepositoryForStaff,
  IRedisClientForStaff,
} from './staff.controller';

export { RegistrationController } from './registration.controller';
export type { IUserDeviceRepositoryForRegistration } from './registration.controller';

export { OAuth2Controller } from './oauth2.controller';
export type {
  IOAuth2ClientRepositoryForOAuth2,
  IOAuth2CodeRepositoryForOAuth2,
  IOAuth2TokenRepositoryForOAuth2,
  IOAuth2ScopeRepositoryForOAuth2,
} from './oauth2.controller';

export { EventsController } from './events.controller';
export type { IEventRepositoryForEvents } from './events.controller';

export { ItemsController } from './items.controller';
export type { IItemRepositoryForItems } from './items.controller';

export { NotificationsViewController } from './notifications-view.controller';
export type { INotificationRepositoryForView } from './notifications-view.controller';

export { ApplicationsController } from './applications.controller';
export type { IOAuth2TokenRepositoryForApplications } from './applications.controller';

export { HomepageController } from './homepage.controller';

export { TimezoneController } from './timezone.controller';

export { IftttController } from './ifttt.controller';
export type {
  IOpenhabRepositoryForIfttt,
  IItemRepositoryForIfttt,
  IEventRepositoryForIfttt,
  ISocketEmitterForIfttt,
  IIftttConfig,
  IConnectionInfo,
} from './ifttt.controller';
