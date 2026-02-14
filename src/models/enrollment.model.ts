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
import type { IEnrollment, EnrollmentDocument } from '../types/models';

// ============================================================================
// Schema Definition
// ============================================================================

const enrollmentSchema = new Schema<IEnrollment, EnrollmentModel>(
  {
    email: { type: String, required: true },
    platform: { type: String },
    javaExp: { type: String },
    description: { type: String },
    created: { type: Date, default: Date.now },
    invited: { type: Date },
  },
  {
    timestamps: false,
  }
);

// ============================================================================
// Static Methods
// ============================================================================

interface EnrollmentModelStatics {
  findByEmail(email: string): Promise<EnrollmentDocument | null>;
  findPending(options?: { limit?: number; skip?: number }): Promise<EnrollmentDocument[]>;
  markInvited(enrollmentId: Types.ObjectId | string): Promise<EnrollmentDocument | null>;
}

enrollmentSchema.static(
  'findByEmail',
  async function (email: string): Promise<EnrollmentDocument | null> {
    return this.findOne({ email }).exec();
  }
);

enrollmentSchema.static(
  'findPending',
  async function (
    options: { limit?: number; skip?: number } = {}
  ): Promise<EnrollmentDocument[]> {
    const { limit = 20, skip = 0 } = options;
    return this.find({ invited: { $exists: false } })
      .sort({ created: 1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }
);

enrollmentSchema.static(
  'markInvited',
  async function (enrollmentId: Types.ObjectId | string): Promise<EnrollmentDocument | null> {
    const objectId =
      typeof enrollmentId === 'string' ? new Types.ObjectId(enrollmentId) : enrollmentId;
    return this.findByIdAndUpdate(objectId, { invited: new Date() }, { new: true }).exec();
  }
);

// ============================================================================
// Model Export
// ============================================================================

export type EnrollmentModel = Model<IEnrollment> & EnrollmentModelStatics;

export const Enrollment = model<IEnrollment, EnrollmentModel>('Enrollment', enrollmentSchema);
