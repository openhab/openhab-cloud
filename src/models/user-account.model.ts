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

import { Schema, model, Model } from 'mongoose';
import type { IUserAccount, UserAccountDocument } from '../types/models';

/**
 * UserAccount Schema
 *
 * Represents an account that can have multiple users.
 * The "master" user owns the account, other users can be invited.
 */
const userAccountSchema = new Schema<IUserAccount>(
  {
    modified: { type: Date },
    registered: { type: Date },
  },
  {
    timestamps: false,
  }
);

// Note: The old code had a broken index referencing non-existent fields.
// We're not adding any indexes here since this model is minimal.

export type UserAccountModel = Model<IUserAccount>;

export const UserAccount = model<IUserAccount, UserAccountModel>(
  'UserAccount',
  userAccountSchema
);

/**
 * Create a new user account
 */
export async function createUserAccount(): Promise<UserAccountDocument> {
  const account = new UserAccount({
    registered: new Date(),
    modified: new Date(),
  });
  return account.save();
}
