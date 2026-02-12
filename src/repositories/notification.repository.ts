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
import type {
  INotificationRepository,
  INotification,
  NotificationPayload,
} from '../types/notification';

/**
 * Interface for the Mongoose Notification model
 * Matches the existing models/notification.js schema
 */
interface NotificationDocument {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  message: string;
  icon?: string;
  severity?: string;
  acknowledged?: boolean;
  payload: NotificationPayload;
  created: Date;
  save(): Promise<NotificationDocument>;
}

interface NotificationModel extends Model<NotificationDocument> {
  new (data: Partial<NotificationDocument>): NotificationDocument;
}

/**
 * Repository for Notification model
 *
 * Wraps the existing Mongoose model with a typed interface.
 * Uses the existing model passed via dependency injection.
 */
export class NotificationRepository implements INotificationRepository {
  constructor(private readonly model: NotificationModel) {}

  async create(data: {
    user: Types.ObjectId | string;
    message: string;
    icon?: string;
    severity?: string;
    payload: NotificationPayload;
  }): Promise<INotification> {
    const notification = new this.model({
      user: data.user,
      message: data.message,
      icon: data.icon,
      severity: data.severity,
      payload: data.payload,
    });

    const saved = await notification.save();

    return {
      _id: saved._id,
      user: saved.user,
      message: saved.message,
      icon: saved.icon,
      severity: saved.severity,
      acknowledged: saved.acknowledged ?? false,
      payload: saved.payload,
      created: saved.created,
    };
  }
}
