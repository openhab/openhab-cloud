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

import { Schema, model, Model, Types } from 'mongoose';
import type { IUserDevice, UserDeviceDocument, DeviceType } from '../types/models';

// ============================================================================
// Schema Definition
// ============================================================================

const userDeviceSchema = new Schema<IUserDevice, UserDeviceModel>(
  {
    owner: { type: Schema.Types.ObjectId, required: true },
    fcmRegistration: { type: String },
    deviceType: { type: String },
    deviceModel: { type: String },
    deviceId: { type: String },
    lastUpdate: { type: Date, default: Date.now, expires: '360d' },
    registered: { type: Date },
  },
  {
    timestamps: false,
  }
);

// ============================================================================
// Indexes
// ============================================================================

userDeviceSchema.index({ owner: 1, deviceType: 1, deviceId: 1 });
userDeviceSchema.index({ fcmRegistration: 1 });

// ============================================================================
// Static Methods
// ============================================================================

interface UserDeviceModelStatics {
  findByOwner(ownerId: Types.ObjectId | string): Promise<UserDeviceDocument[]>;
  findByFcmToken(token: string): Promise<UserDeviceDocument | null>;
  registerOrUpdate(
    ownerId: Types.ObjectId | string,
    deviceId: string,
    deviceType: DeviceType,
    fcmRegistration: string,
    deviceModel?: string
  ): Promise<UserDeviceDocument>;
}

/**
 * Find all devices for a user.
 */
userDeviceSchema.static(
  'findByOwner',
  async function (ownerId: Types.ObjectId | string): Promise<UserDeviceDocument[]> {
    const objectId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;
    return this.find({ owner: objectId }).exec();
  }
);

/**
 * Find a device by FCM registration token.
 */
userDeviceSchema.static(
  'findByFcmToken',
  async function (token: string): Promise<UserDeviceDocument | null> {
    return this.findOne({ fcmRegistration: token }).exec();
  }
);

/**
 * Register a new device or update existing one.
 */
userDeviceSchema.static(
  'registerOrUpdate',
  async function (
    ownerId: Types.ObjectId | string,
    deviceId: string,
    deviceType: DeviceType,
    fcmRegistration: string,
    deviceModel?: string
  ): Promise<UserDeviceDocument> {
    const objectId = typeof ownerId === 'string' ? new Types.ObjectId(ownerId) : ownerId;

    const existing = await this.findOne({
      owner: objectId,
      deviceType,
      deviceId,
    }).exec();

    if (existing) {
      existing.fcmRegistration = fcmRegistration;
      existing.lastUpdate = new Date();
      if (deviceModel) {
        existing.deviceModel = deviceModel;
      }
      return existing.save();
    }

    const device = new this({
      owner: objectId,
      deviceId,
      deviceType,
      fcmRegistration,
      deviceModel,
      lastUpdate: new Date(),
      registered: new Date(),
    });

    return device.save();
  }
);

// ============================================================================
// Model Export
// ============================================================================

export type UserDeviceModel = Model<IUserDevice> & UserDeviceModelStatics;

export const UserDevice = model<IUserDevice, UserDeviceModel>('UserDevice', userDeviceSchema);
