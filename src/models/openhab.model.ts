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
import type { IOpenhab, OpenhabDocument } from '../types/models';

// ============================================================================
// Schema Definition
// ============================================================================

const openhabSchema = new Schema<IOpenhab, OpenhabModel>(
  {
    name: { type: String },
    uuid: { type: String, unique: true, required: true },
    secret: { type: String, required: true },
    account: { type: Schema.Types.ObjectId, required: true },
    last_online: { type: Date },
  },
  {
    timestamps: false,
  }
);

// ============================================================================
// Indexes
// ============================================================================

openhabSchema.index({ account: 1 });

// ============================================================================
// Static Methods
// ============================================================================

interface OpenhabModelStatics {
  authenticate(uuid: string, secret: string): Promise<OpenhabDocument | null>;
  setLastOnline(id: Types.ObjectId | string): Promise<OpenhabDocument | null>;
  findByUuid(uuid: string): Promise<OpenhabDocument | null>;
  findByAccount(accountId: Types.ObjectId | string): Promise<OpenhabDocument | null>;
}

/**
 * Authenticate an OpenHAB instance by UUID and secret.
 */
openhabSchema.static(
  'authenticate',
  async function (uuid: string, secret: string): Promise<OpenhabDocument | null> {
    return this.findOne({ uuid, secret }).exec();
  }
);

/**
 * Update the last_online timestamp for an OpenHAB instance.
 */
openhabSchema.static(
  'setLastOnline',
  async function (id: Types.ObjectId | string): Promise<OpenhabDocument | null> {
    const objectId = typeof id === 'string' ? new Types.ObjectId(id) : id;
    return this.findOneAndUpdate(
      { _id: objectId },
      { $set: { last_online: new Date() } },
      { new: true }
    ).exec();
  }
);

/**
 * Find an OpenHAB instance by UUID.
 */
openhabSchema.static(
  'findByUuid',
  async function (uuid: string): Promise<OpenhabDocument | null> {
    return this.findOne({ uuid }).exec();
  }
);

/**
 * Find an OpenHAB instance by account ID.
 */
openhabSchema.static(
  'findByAccount',
  async function (accountId: Types.ObjectId | string): Promise<OpenhabDocument | null> {
    const objectId = typeof accountId === 'string' ? new Types.ObjectId(accountId) : accountId;
    return this.findOne({ account: objectId }).exec();
  }
);

// ============================================================================
// Model Export
// ============================================================================

export type OpenhabModel = Model<IOpenhab> & OpenhabModelStatics;

export const Openhab = model<IOpenhab, OpenhabModel>('Openhab', openhabSchema);
