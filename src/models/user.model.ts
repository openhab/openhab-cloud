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
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import type { IUser, IUserMethods, UserDocument, IOpenhab, UserRole } from '../types/models';

// ============================================================================
// Password Cache (Performance optimization for bcrypt)
// ============================================================================

interface CacheEntry {
  result: boolean;
  expires: number;
}

const passwordCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
const CACHE_MAX_SIZE = 10000; // Maximum number of cache entries

function sha1Hash(str: string): string {
  return crypto.createHash('sha1').update(str).digest('hex');
}

// Clean expired cache entries periodically and enforce size limit
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of passwordCache.entries()) {
    if (now > value.expires) {
      passwordCache.delete(key);
    }
  }
  // If still over size limit after expiration cleanup, clear oldest entries
  if (passwordCache.size > CACHE_MAX_SIZE) {
    const entriesToDelete = passwordCache.size - CACHE_MAX_SIZE;
    let deleted = 0;
    for (const key of passwordCache.keys()) {
      if (deleted >= entriesToDelete) break;
      passwordCache.delete(key);
      deleted++;
    }
  }
}, 60000);

// ============================================================================
// Schema Definition
// ============================================================================

const userSchema = new Schema<IUser, UserModel, IUserMethods>(
  {
    username: { type: String, unique: true, required: true },
    firstName: { type: String },
    lastName: { type: String },
    salt: { type: String, required: true },
    hash: { type: String, required: true },
    created: { type: Date, default: Date.now },
    active: { type: Boolean, default: true, required: true },
    role: { type: String },
    account: { type: Schema.Types.ObjectId, ref: 'UserAccount' },
    group: { type: String },
    verifiedEmail: { type: Boolean, default: false },
    registered: { type: Date, default: Date.now },
    last_online: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
  }
);

// ============================================================================
// Indexes
// ============================================================================

userSchema.index({ account: 1, role: 1 });

// ============================================================================
// Virtual: password
// ============================================================================

userSchema
  .virtual('password')
  .get(function (this: UserDocument) {
    return (this as unknown as { _password?: string })._password;
  })
  .set(function (this: UserDocument, password: string) {
    (this as unknown as { _password: string })._password = password;
    const salt = bcrypt.genSaltSync(10);
    this.salt = salt;
    this.hash = bcrypt.hashSync(password, salt);
  });

// ============================================================================
// Instance Methods
// ============================================================================

/**
 * Check if the provided password matches the user's password.
 * Uses a cache to avoid expensive bcrypt operations on repeated checks.
 */
userSchema.method('checkPassword', async function (this: UserDocument, password: string): Promise<boolean> {
  const cacheKey = `${this._id}:${sha1Hash(password)}`;
  const now = Date.now();

  // Check cache first
  const cached = passwordCache.get(cacheKey);
  if (cached && now < cached.expires) {
    return cached.result;
  }

  // If not in cache, do full bcrypt comparison
  const result = await bcrypt.compare(password, this.hash);

  // Cache the result
  passwordCache.set(cacheKey, {
    result,
    expires: now + CACHE_TTL_MS,
  });

  return result;
});

/**
 * Get the OpenHAB instance associated with this user's account.
 */
userSchema.method('getOpenhab', async function (this: UserDocument): Promise<IOpenhab | null> {
  // Import here to avoid circular dependency
  const { Openhab } = await import('./openhab.model');
  return Openhab.findOne({ account: this.account }).exec();
});

// ============================================================================
// Static Methods
// ============================================================================

interface UserModelStatics {
  authenticate(username: string, password: string): Promise<UserDocument | null>;
  register(username: string, password: string): Promise<UserDocument>;
  registerToAccount(
    username: string,
    password: string,
    accountId: Types.ObjectId,
    role: UserRole
  ): Promise<UserDocument>;
}

/**
 * Authenticate a user by username and password.
 * Returns the user if authentication succeeds, null otherwise.
 */
userSchema.static(
  'authenticate',
  async function (username: string, password: string): Promise<UserDocument | null> {
    const user = await this.findOne({ username: username.toLowerCase() }).exec();

    if (!user) {
      return null;
    }

    const passwordCorrect = await user.checkPassword(password);
    if (!passwordCorrect) {
      return null;
    }

    if (!user.active) {
      return null;
    }

    return user;
  }
);

/**
 * Register a new user with a new account.
 * The user will be the "master" of the new account.
 */
userSchema.static(
  'register',
  async function (username: string, password: string): Promise<UserDocument> {
    const { createUserAccount } = await import('./user-account.model');
    const account = await createUserAccount();

    const user = new this({
      username: username.trim().toLowerCase(),
      role: 'master',
      account: account._id,
    });

    // Set password via virtual (triggers hash generation)
    (user as unknown as { password: string }).password = password;

    return user.save();
  }
);

/**
 * Register a new user to an existing account.
 */
userSchema.static(
  'registerToAccount',
  async function (
    username: string,
    password: string,
    accountId: Types.ObjectId,
    role: UserRole
  ): Promise<UserDocument> {
    const user = new this({
      username: username.trim().toLowerCase(),
      role,
      account: accountId,
    });

    // Set password via virtual (triggers hash generation)
    (user as unknown as { password: string }).password = password;

    return user.save();
  }
);

// ============================================================================
// Model Export
// ============================================================================

export type UserModel = Model<IUser, object, IUserMethods> & UserModelStatics;

export const User = model<IUser, UserModel>('User', userSchema);
