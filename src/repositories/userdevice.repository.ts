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

import type { Model, Types } from 'mongoose';
import type { IUserDeviceRepository, IUserDevice, DeviceType } from '../types/notification';

/**
 * Interface for the Mongoose UserDevice model
 * Matches the existing models/userdevice.js schema
 */
interface UserDeviceDocument {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  fcmRegistration?: string;
  deviceType?: string;
  deviceModel?: string;
  deviceId?: string;
  lastUpdate: Date;
  registered?: Date;
}

/**
 * Model type for UserDevice - exported for use in adapters
 */
export interface UserDeviceModel extends Model<UserDeviceDocument> {}

/**
 * Repository for UserDevice model
 *
 * Wraps the existing Mongoose model with a typed interface.
 * Uses the existing model passed via dependency injection.
 */
export class UserDeviceRepository implements IUserDeviceRepository {
  constructor(private readonly model: UserDeviceModel) {}

  async findByOwner(ownerId: string): Promise<IUserDevice[]> {
    const devices = await this.model.find({ owner: ownerId }).exec();

    return devices.map(device => ({
      _id: device._id,
      owner: device.owner,
      fcmRegistration: device.fcmRegistration,
      deviceType: device.deviceType as DeviceType | undefined,
      deviceModel: device.deviceModel,
      deviceId: device.deviceId,
      lastUpdate: device.lastUpdate,
      registered: device.registered,
    }));
  }
}
