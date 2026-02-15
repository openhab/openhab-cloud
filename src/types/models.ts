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

import type { Types, Document } from 'mongoose';

// User & Account

export type UserRole = 'master' | 'user';
export type UserGroup = 'staff' | 'user';

export interface IUser {
  _id: Types.ObjectId;
  username: string;
  firstName?: string;
  lastName?: string;
  salt: string;
  hash: string;
  created: Date;
  active: boolean;
  role: UserRole;
  account: Types.ObjectId;
  group?: UserGroup;
  verifiedEmail: boolean;
  registered: Date;
  last_online?: Date;
}

export interface IUserMethods {
  checkPassword(password: string): Promise<boolean>;
  getOpenhab(): Promise<IOpenhab | null>;
}

export interface IUserAccount {
  _id: Types.ObjectId;
  modified?: Date;
  registered?: Date;
}

// OpenHAB

export interface IOpenhab {
  _id: Types.ObjectId;
  name?: string;
  uuid: string;
  secret: string;
  account: Types.ObjectId;
  last_online?: Date;
}

// User Devices

export type DeviceType = 'ios' | 'android';

export interface IUserDevice {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  fcmRegistration?: string;
  deviceType?: DeviceType;
  deviceModel?: string;
  deviceId?: string;
  lastUpdate: Date;
  registered?: Date;
}

// Notifications

/**
 * Notification payload sent from openHAB
 */
export interface NotificationPayload {
  message: string;
  title?: string;
  icon?: string;
  severity?: string;
  tag?: string;
  type?: 'notification' | 'hideNotification';
  'reference-id'?: string;
  actions?: string;
  [key: string]: unknown;
}

export interface INotification {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  message: string;
  icon?: string;
  severity?: string;
  acknowledged?: boolean;
  payload: NotificationPayload;
  created: Date;
}

// OAuth2

export interface IOAuth2Client {
  _id: Types.ObjectId;
  name?: string;
  description?: string;
  homeUrl?: string;
  icon?: string;
  clientId: string;
  clientSecret: string;
  active: boolean;
  created: Date;
  last_change?: Date;
}

export interface IOAuth2Token {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  oAuthClient: Types.ObjectId;
  token: string;
  scope: string[];
  valid: boolean;
  created: Date;
}

export interface IOAuth2Code {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  oAuthClient: Types.ObjectId;
  code: string;
  scope: string[];
  redirectURI: string;
  valid: boolean;
  created: Date;
}

export interface IOAuth2Scope {
  _id: Types.ObjectId;
  name: string;
  description?: string;
  valid: boolean;
  created: Date;
}

// Events & Items

export type EventColor = 'good' | 'bad' | 'info';

export interface IEvent {
  _id: Types.ObjectId;
  openhab: Types.ObjectId;
  source: string;
  oldStatus?: string;
  status: string;
  numericStatus?: number;
  oldNumericStatus?: number;
  color?: EventColor;
  when: Date;
}

export interface IItemState {
  when: Date;
  value: string;
}

export interface IItem {
  _id: Types.ObjectId;
  openhab: Types.ObjectId;
  name: string;
  type?: string;
  label?: string;
  groups?: Types.ObjectId[];
  icon?: string;
  status?: string;
  prev_status?: string;
  last_update?: Date;
  last_change?: Date;
  states?: IItemState[];
}

// Verification & Invitations

export interface IEmailVerification {
  _id: Types.ObjectId;
  code: string;
  email: string;
  user: Types.ObjectId;
  used: boolean;
  created: Date;
}

export interface IInvitation {
  _id: Types.ObjectId;
  code: string;
  email: string;
  used: boolean;
  lastNotified?: Date;
  created: Date;
  activated?: Date;
}

export interface ILostPassword {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  recoveryCode: string;
  used: boolean;
  created: Date;
}

// Enrollment

export interface IEnrollment {
  _id: Types.ObjectId;
  email: string;
  platform?: string;
  javaExp?: string;
  description?: string;
  created: Date;
  invited?: Date;
}

// Document Types (Mongoose)

export type UserDocument = Document<Types.ObjectId, object, IUser> & IUser & IUserMethods;
export type UserAccountDocument = Document<Types.ObjectId, object, IUserAccount> & IUserAccount;
export type OpenhabDocument = Document<Types.ObjectId, object, IOpenhab> & IOpenhab;
export type UserDeviceDocument = Document<Types.ObjectId, object, IUserDevice> & IUserDevice;
export type NotificationDocument = Document<Types.ObjectId, object, INotification> & INotification;
export type OAuth2ClientDocument = Document<Types.ObjectId, object, IOAuth2Client> & IOAuth2Client;
export type OAuth2TokenDocument = Document<Types.ObjectId, object, IOAuth2Token> & IOAuth2Token;
export type OAuth2CodeDocument = Document<Types.ObjectId, object, IOAuth2Code> & IOAuth2Code;
export type OAuth2ScopeDocument = Document<Types.ObjectId, object, IOAuth2Scope> & IOAuth2Scope;
export type EventDocument = Document<Types.ObjectId, object, IEvent> & IEvent;
export type ItemDocument = Document<Types.ObjectId, object, IItem> & IItem;
export type EmailVerificationDocument = Document<Types.ObjectId, object, IEmailVerification> & IEmailVerification;
export type InvitationDocument = Document<Types.ObjectId, object, IInvitation> & IInvitation;
export type LostPasswordDocument = Document<Types.ObjectId, object, ILostPassword> & ILostPassword;
export type EnrollmentDocument = Document<Types.ObjectId, object, IEnrollment> & IEnrollment;
