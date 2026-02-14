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
import type { IEvent, EventDocument, EventColor } from '../types/models';

// ============================================================================
// Color Constants
// ============================================================================

const COLOR_HEX_MAP: Record<EventColor, string> = {
  good: '#e0f0d5',
  bad: '#f1dede',
  info: '#daedf8',
};

// ============================================================================
// Schema Definition
// ============================================================================

const eventSchema = new Schema<IEvent, EventModel>(
  {
    openhab: { type: Schema.Types.ObjectId, required: true },
    source: { type: String, required: true },
    oldStatus: { type: String },
    status: { type: String, required: true },
    numericStatus: { type: Number },
    oldNumericStatus: { type: Number },
    color: { type: String },
    when: { type: Date, default: Date.now, expires: '14d' },
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

eventSchema.index({ openhab: 1 });
eventSchema.index({ openhab: 1, when: 1 });
eventSchema.index({ openhab: 1, source: 1 });
eventSchema.index({ openhab: 1, source: 1, status: 1 });
eventSchema.index({ openhab: 1, source: 1, numericStatus: 1, oldNumericStatus: 1 });

// ============================================================================
// Virtual: colorHex
// ============================================================================

eventSchema.virtual('colorHex').get(function (this: EventDocument): string | undefined {
  if (this.color && this.color in COLOR_HEX_MAP) {
    return COLOR_HEX_MAP[this.color as EventColor];
  }
  return undefined;
});

// ============================================================================
// Static Methods
// ============================================================================

interface EventModelStatics {
  findByOpenhab(
    openhabId: Types.ObjectId | string,
    options?: { limit?: number; skip?: number; source?: string }
  ): Promise<IEvent[]>;
  countByOpenhab(openhabId: Types.ObjectId | string, source?: string): Promise<number>;
}

/**
 * Find events for an OpenHAB instance.
 */
eventSchema.static(
  'findByOpenhab',
  async function (
    openhabId: Types.ObjectId | string,
    options: { limit?: number; skip?: number; source?: string } = {}
  ): Promise<IEvent[]> {
    const objectId = typeof openhabId === 'string' ? new Types.ObjectId(openhabId) : openhabId;
    const { limit = 20, skip = 0, source } = options;

    const query: Record<string, unknown> = { openhab: objectId };
    if (source) {
      query['source'] = source;
    }

    return this.find(query)
      .sort({ when: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();
  }
);

/**
 * Count events for an OpenHAB instance.
 */
eventSchema.static(
  'countByOpenhab',
  async function (openhabId: Types.ObjectId | string, source?: string): Promise<number> {
    const objectId = typeof openhabId === 'string' ? new Types.ObjectId(openhabId) : openhabId;

    const query: Record<string, unknown> = { openhab: objectId };
    if (source) {
      query['source'] = source;
    }

    return this.countDocuments(query).exec();
  }
);

// ============================================================================
// Model Export
// ============================================================================

export type EventModel = Model<IEvent> & EventModelStatics;

export const Event = model<IEvent, EventModel>('Event', eventSchema);
