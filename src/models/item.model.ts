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
import type { IItem, IItemState, ItemDocument } from '../types/models';

// ============================================================================
// Item State Sub-Schema
// ============================================================================

const itemStateSchema = new Schema<IItemState>(
  {
    when: { type: Date, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

// ============================================================================
// Schema Definition
// ============================================================================

const itemSchema = new Schema<IItem, ItemModel>(
  {
    openhab: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    type: { type: String },
    label: { type: String },
    groups: [{ type: Schema.Types.ObjectId }],
    icon: { type: String },
    status: { type: String },
    prev_status: { type: String },
    last_update: { type: Date },
    last_change: { type: Date },
    states: [itemStateSchema],
  },
  {
    versionKey: false,
    writeConcern: { w: 0, j: false, wtimeout: 10000 },
    validateBeforeSave: false,
    strict: false,
  }
);

// ============================================================================
// Indexes
// ============================================================================

itemSchema.index({ openhab: 1, name: 1 }, { unique: true });

// ============================================================================
// Static Methods
// ============================================================================

interface ItemModelStatics {
  findByOpenhab(openhabId: Types.ObjectId | string): Promise<IItem[]>;
  findByName(openhabId: Types.ObjectId | string, name: string): Promise<ItemDocument | null>;
  updateStatus(
    openhabId: Types.ObjectId | string,
    name: string,
    status: string
  ): Promise<ItemDocument | null>;
}

/**
 * Find all items for an OpenHAB instance.
 */
itemSchema.static(
  'findByOpenhab',
  async function (openhabId: Types.ObjectId | string): Promise<IItem[]> {
    const objectId = typeof openhabId === 'string' ? new Types.ObjectId(openhabId) : openhabId;
    return this.find({ openhab: objectId }).lean().exec();
  }
);

/**
 * Find an item by name for an OpenHAB instance.
 */
itemSchema.static(
  'findByName',
  async function (
    openhabId: Types.ObjectId | string,
    name: string
  ): Promise<ItemDocument | null> {
    const objectId = typeof openhabId === 'string' ? new Types.ObjectId(openhabId) : openhabId;
    return this.findOne({ openhab: objectId, name }).exec();
  }
);

/**
 * Update the status of an item, tracking the previous status and state history.
 */
itemSchema.static(
  'updateStatus',
  async function (
    openhabId: Types.ObjectId | string,
    name: string,
    status: string
  ): Promise<ItemDocument | null> {
    const objectId = typeof openhabId === 'string' ? new Types.ObjectId(openhabId) : openhabId;
    const now = new Date();

    const item = await this.findOne({ openhab: objectId, name }).exec();

    if (!item) {
      return null;
    }

    // Track state change
    const isChange = item.status !== status;

    item.prev_status = item.status;
    item.status = status;
    item.last_update = now;

    if (isChange) {
      item.last_change = now;

      // Add to state history (keep last 50)
      const newState: IItemState = { when: now, value: status };
      item.states = item.states || [];
      item.states.unshift(newState);
      if (item.states.length > 50) {
        item.states = item.states.slice(0, 50);
      }
    }

    return item.save();
  }
);

// ============================================================================
// Model Export
// ============================================================================

export type ItemModel = Model<IItem> & ItemModelStatics;

export const Item = model<IItem, ItemModel>('Item', itemSchema);
