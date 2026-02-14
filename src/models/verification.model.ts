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
import { v1 as uuidv1 } from 'uuid';
import type {
  IEmailVerification,
  IInvitation,
  ILostPassword,
  EmailVerificationDocument,
  InvitationDocument,
  LostPasswordDocument,
} from '../types/models';

// ============================================================================
// Email Verification
// ============================================================================

const emailVerificationSchema = new Schema<IEmailVerification>(
  {
    code: { type: String, required: true },
    email: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    used: { type: Boolean, default: false },
    created: { type: Date, default: Date.now, expires: '30d' },
  },
  {
    timestamps: false,
  }
);

interface EmailVerificationModelStatics {
  createForUser(userId: Types.ObjectId | string, email: string): Promise<EmailVerificationDocument>;
  findByCode(code: string): Promise<EmailVerificationDocument | null>;
  markUsed(verificationId: Types.ObjectId | string): Promise<EmailVerificationDocument | null>;
}

emailVerificationSchema.static(
  'createForUser',
  async function (
    userId: Types.ObjectId | string,
    email: string
  ): Promise<EmailVerificationDocument> {
    const objectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const verification = new this({
      code: uuidv1(),
      email,
      user: objectId,
    });
    return verification.save();
  }
);

emailVerificationSchema.static(
  'findByCode',
  async function (code: string): Promise<EmailVerificationDocument | null> {
    return this.findOne({ code, used: false }).exec();
  }
);

emailVerificationSchema.static(
  'markUsed',
  async function (
    verificationId: Types.ObjectId | string
  ): Promise<EmailVerificationDocument | null> {
    const objectId =
      typeof verificationId === 'string' ? new Types.ObjectId(verificationId) : verificationId;
    return this.findByIdAndUpdate(objectId, { used: true }, { new: true }).exec();
  }
);

export type EmailVerificationModel = Model<IEmailVerification> & EmailVerificationModelStatics;
export const EmailVerification = model<IEmailVerification, EmailVerificationModel>(
  'EmailVerification',
  emailVerificationSchema
);

// ============================================================================
// Invitation
// ============================================================================

const invitationSchema = new Schema<IInvitation>(
  {
    code: { type: String, required: true },
    email: { type: String, required: true },
    used: { type: Boolean, default: false },
    lastNotified: { type: Date },
    created: { type: Date, default: Date.now, expires: '30d' },
    activated: { type: Date },
  },
  {
    timestamps: false,
  }
);

interface InvitationModelStatics {
  createInvitation(email: string): Promise<InvitationDocument>;
  findByCode(code: string): Promise<InvitationDocument | null>;
  findByEmail(email: string): Promise<InvitationDocument | null>;
  markUsed(invitationId: Types.ObjectId | string): Promise<InvitationDocument | null>;
  updateLastNotified(invitationId: Types.ObjectId | string): Promise<InvitationDocument | null>;
}

invitationSchema.static('createInvitation', async function (email: string): Promise<InvitationDocument> {
  const invitation = new this({
    code: uuidv1(),
    email,
  });
  return invitation.save();
});

invitationSchema.static(
  'findByCode',
  async function (code: string): Promise<InvitationDocument | null> {
    return this.findOne({ code, used: false }).exec();
  }
);

invitationSchema.static(
  'findByEmail',
  async function (email: string): Promise<InvitationDocument | null> {
    return this.findOne({ email }).exec();
  }
);

invitationSchema.static(
  'markUsed',
  async function (invitationId: Types.ObjectId | string): Promise<InvitationDocument | null> {
    const objectId =
      typeof invitationId === 'string' ? new Types.ObjectId(invitationId) : invitationId;
    return this.findByIdAndUpdate(
      objectId,
      { used: true, activated: new Date() },
      { new: true }
    ).exec();
  }
);

invitationSchema.static(
  'updateLastNotified',
  async function (invitationId: Types.ObjectId | string): Promise<InvitationDocument | null> {
    const objectId =
      typeof invitationId === 'string' ? new Types.ObjectId(invitationId) : invitationId;
    return this.findByIdAndUpdate(objectId, { lastNotified: new Date() }, { new: true }).exec();
  }
);

export type InvitationModel = Model<IInvitation> & InvitationModelStatics;
export const Invitation = model<IInvitation, InvitationModel>('Invitation', invitationSchema);

// ============================================================================
// Lost Password
// ============================================================================

const lostPasswordSchema = new Schema<ILostPassword>(
  {
    user: { type: Schema.Types.ObjectId, required: true },
    recoveryCode: { type: String, required: true },
    used: { type: Boolean, default: false },
    created: { type: Date, default: Date.now, expires: '30d' },
  },
  {
    timestamps: false,
  }
);

lostPasswordSchema.index({ user: 1, created: 1 });

interface LostPasswordModelStatics {
  createForUser(userId: Types.ObjectId | string): Promise<LostPasswordDocument>;
  findByCode(recoveryCode: string): Promise<LostPasswordDocument | null>;
  markUsed(lostPasswordId: Types.ObjectId | string): Promise<LostPasswordDocument | null>;
}

lostPasswordSchema.static(
  'createForUser',
  async function (userId: Types.ObjectId | string): Promise<LostPasswordDocument> {
    const objectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    const lostPassword = new this({
      user: objectId,
      recoveryCode: uuidv1(),
    });
    return lostPassword.save();
  }
);

lostPasswordSchema.static(
  'findByCode',
  async function (recoveryCode: string): Promise<LostPasswordDocument | null> {
    return this.findOne({ recoveryCode, used: false }).exec();
  }
);

lostPasswordSchema.static(
  'markUsed',
  async function (lostPasswordId: Types.ObjectId | string): Promise<LostPasswordDocument | null> {
    const objectId =
      typeof lostPasswordId === 'string' ? new Types.ObjectId(lostPasswordId) : lostPasswordId;
    return this.findByIdAndUpdate(objectId, { used: true }, { new: true }).exec();
  }
);

export type LostPasswordModel = Model<ILostPassword> & LostPasswordModelStatics;
export const LostPassword = model<ILostPassword, LostPasswordModel>(
  'LostPassword',
  lostPasswordSchema
);
