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
import type { INotification, NotificationDocument } from '../types/models';

// ============================================================================
// Schema Definition
// ============================================================================

const notificationSchema = new Schema<INotification, NotificationModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, default: '' },
    icon: { type: String },
    severity: { type: String },
    acknowledged: { type: Boolean, default: false },
    payload: { type: Schema.Types.Mixed, default: {} },
    created: { type: Date, default: Date.now, expires: '30d' },
  },
  {
    timestamps: false,
  }
);

// ============================================================================
// Indexes
// ============================================================================

notificationSchema.index({ user: 1, created: 1 });

// ============================================================================
// Static Methods
// ============================================================================

interface NotificationModelStatics {
  findByUser(
    userId: Types.ObjectId | string,
    options?: { limit?: number; skip?: number }
  ): Promise<NotificationDocument[]>;
  acknowledge(notificationId: Types.ObjectId | string): Promise<NotificationDocument | null>;
}

/**
 * Find notifications for a user.
 */
notificationSchema.static(
  'findByUser',
  async function (
    userId: Types.ObjectId | string,
    options: { limit?: number; skip?: number } = {}
  ): Promise<NotificationDocument[]> {
    const objectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const { limit = 20, skip = 0 } = options;

    return this.find({ user: objectId })
      .sort({ created: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }
);

/**
 * Acknowledge a notification.
 */
notificationSchema.static(
  'acknowledge',
  async function (notificationId: Types.ObjectId | string): Promise<NotificationDocument | null> {
    const objectId =
      typeof notificationId === 'string' ? new Types.ObjectId(notificationId) : notificationId;
    return this.findByIdAndUpdate(objectId, { acknowledged: true }, { new: true }).exec();
  }
);

// ============================================================================
// Model Export
// ============================================================================

export type NotificationModel = Model<INotification> & NotificationModelStatics;

export const Notification = model<INotification, NotificationModel>(
  'Notification',
  notificationSchema
);
