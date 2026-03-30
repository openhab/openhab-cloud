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
import { randomUUID } from 'crypto';
import type { IWebhook, WebhookDocument } from '../types/models';

// ============================================================================
// Schema Definition
// ============================================================================

const webhookSchema = new Schema<IWebhook, WebhookModel>(
  {
    uuid: { type: String, required: true, unique: true },
    openhab: { type: Schema.Types.ObjectId, required: true, ref: 'Openhab' },
    localPath: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  {
    versionKey: false,
  }
);

// ============================================================================
// Indexes
// ============================================================================

// Compound unique index: same openHAB + localPath always maps to same webhook
webhookSchema.index({ openhab: 1, localPath: 1 }, { unique: true });

// TTL index: MongoDB automatically deletes documents when expiresAt passes
webhookSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ============================================================================
// Static Methods
// ============================================================================

interface WebhookModelStatics {
  /**
   * Register or refresh a webhook. Upserts: if a webhook for this
   * openhab + localPath exists, refreshes expiresAt; otherwise creates
   * a new one with a fresh UUID.
   */
  registerWebhook(
    openhabId: Types.ObjectId | string,
    localPath: string,
    ttlDays?: number
  ): Promise<IWebhook>;

  /**
   * Remove a webhook by openhab + localPath.
   */
  removeWebhook(
    openhabId: Types.ObjectId | string,
    localPath: string
  ): Promise<void>;

  /**
   * Find a webhook by its UUID (for HTTP handler lookup).
   */
  findByUuid(uuid: string): Promise<IWebhook | null>;
}

webhookSchema.static(
  'registerWebhook',
  async function (
    openhabId: Types.ObjectId | string,
    localPath: string,
    ttlDays = 30
  ): Promise<IWebhook> {
    const objectId =
      typeof openhabId === 'string' ? new Types.ObjectId(openhabId) : openhabId;
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    const webhook = await this.findOneAndUpdate(
      { openhab: objectId, localPath },
      {
        $set: { expiresAt },
        $setOnInsert: { uuid: randomUUID(), createdAt: new Date() },
      },
      { upsert: true, new: true }
    ).lean();

    return webhook as IWebhook;
  }
);

webhookSchema.static(
  'removeWebhook',
  async function (
    openhabId: Types.ObjectId | string,
    localPath: string
  ): Promise<void> {
    const objectId =
      typeof openhabId === 'string' ? new Types.ObjectId(openhabId) : openhabId;
    await this.deleteOne({ openhab: objectId, localPath });
  }
);

webhookSchema.static(
  'findByUuid',
  async function (uuid: string): Promise<IWebhook | null> {
    return this.findOne({ uuid }).lean();
  }
);

// ============================================================================
// Model Export
// ============================================================================

export type WebhookModel = Model<IWebhook> & WebhookModelStatics;

export const Webhook = model<IWebhook, WebhookModel>('Webhook', webhookSchema);
