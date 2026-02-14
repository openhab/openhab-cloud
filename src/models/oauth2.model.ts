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
import type {
  IOAuth2Client,
  IOAuth2Token,
  IOAuth2Code,
  IOAuth2Scope,
  OAuth2ClientDocument,
  OAuth2TokenDocument,
  OAuth2CodeDocument,
  OAuth2ScopeDocument,
} from '../types/models';

// ============================================================================
// OAuth2 Client
// ============================================================================

const oauth2ClientSchema = new Schema<IOAuth2Client>(
  {
    name: { type: String },
    description: { type: String },
    homeUrl: { type: String },
    icon: { type: String },
    clientId: { type: String, required: true },
    clientSecret: { type: String, required: true },
    active: { type: Boolean, default: true },
    created: { type: Date, default: Date.now },
    last_change: { type: Date },
  },
  {
    timestamps: false,
  }
);

oauth2ClientSchema.index({ clientId: 1 }, { unique: true });

interface OAuth2ClientModelStatics {
  findByClientId(clientId: string): Promise<OAuth2ClientDocument | null>;
  authenticate(clientId: string, clientSecret: string): Promise<OAuth2ClientDocument | null>;
}

oauth2ClientSchema.static(
  'findByClientId',
  async function (clientId: string): Promise<OAuth2ClientDocument | null> {
    return this.findOne({ clientId }).exec();
  }
);

oauth2ClientSchema.static(
  'authenticate',
  async function (clientId: string, clientSecret: string): Promise<OAuth2ClientDocument | null> {
    return this.findOne({ clientId, clientSecret, active: true }).exec();
  }
);

export type OAuth2ClientModel = Model<IOAuth2Client> & OAuth2ClientModelStatics;
export const OAuth2Client = model<IOAuth2Client, OAuth2ClientModel>('OAuth2Client', oauth2ClientSchema);

// ============================================================================
// OAuth2 Token
// ============================================================================

const oauth2TokenSchema = new Schema<IOAuth2Token>(
  {
    user: { type: Schema.Types.ObjectId, required: true },
    oAuthClient: { type: Schema.Types.ObjectId, ref: 'OAuth2Client', required: true },
    token: { type: String, required: true },
    scope: [{ type: String }],
    valid: { type: Boolean, default: true },
    created: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
  }
);

oauth2TokenSchema.index({ token: 1, oAuthClient: 1 });
oauth2TokenSchema.index({ user: 1 });

interface OAuth2TokenModelStatics {
  findByToken(token: string): Promise<OAuth2TokenDocument | null>;
  findByUser(userId: Types.ObjectId | string): Promise<OAuth2TokenDocument[]>;
  invalidate(tokenId: Types.ObjectId | string): Promise<OAuth2TokenDocument | null>;
}

oauth2TokenSchema.static(
  'findByToken',
  async function (token: string): Promise<OAuth2TokenDocument | null> {
    return this.findOne({ token, valid: true }).exec();
  }
);

oauth2TokenSchema.static(
  'findByUser',
  async function (userId: Types.ObjectId | string): Promise<OAuth2TokenDocument[]> {
    const objectId = typeof userId === 'string' ? new Types.ObjectId(userId) : userId;
    return this.find({ user: objectId }).populate('oAuthClient').exec();
  }
);

oauth2TokenSchema.static(
  'invalidate',
  async function (tokenId: Types.ObjectId | string): Promise<OAuth2TokenDocument | null> {
    const objectId = typeof tokenId === 'string' ? new Types.ObjectId(tokenId) : tokenId;
    return this.findByIdAndUpdate(objectId, { valid: false }, { new: true }).exec();
  }
);

export type OAuth2TokenModel = Model<IOAuth2Token> & OAuth2TokenModelStatics;
export const OAuth2Token = model<IOAuth2Token, OAuth2TokenModel>('OAuth2Token', oauth2TokenSchema);

// ============================================================================
// OAuth2 Code
// ============================================================================

const oauth2CodeSchema = new Schema<IOAuth2Code>(
  {
    user: { type: Schema.Types.ObjectId, required: true },
    oAuthClient: { type: Schema.Types.ObjectId, required: true },
    code: { type: String, required: true },
    scope: [{ type: String }],
    redirectURI: { type: String, required: true },
    valid: { type: Boolean, default: true },
    created: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
  }
);

oauth2CodeSchema.index({ code: 1, oAuthClient: 1 });
oauth2CodeSchema.index({ code: 1, oAuthClient: 1, redirectURI: 1 });
oauth2CodeSchema.index({ user: 1 });

interface OAuth2CodeModelStatics {
  findByCode(code: string, clientId: Types.ObjectId | string): Promise<OAuth2CodeDocument | null>;
  invalidate(codeId: Types.ObjectId | string): Promise<OAuth2CodeDocument | null>;
}

oauth2CodeSchema.static(
  'findByCode',
  async function (
    code: string,
    clientId: Types.ObjectId | string
  ): Promise<OAuth2CodeDocument | null> {
    const objectId = typeof clientId === 'string' ? new Types.ObjectId(clientId) : clientId;
    return this.findOne({ code, oAuthClient: objectId, valid: true }).exec();
  }
);

oauth2CodeSchema.static(
  'invalidate',
  async function (codeId: Types.ObjectId | string): Promise<OAuth2CodeDocument | null> {
    const objectId = typeof codeId === 'string' ? new Types.ObjectId(codeId) : codeId;
    return this.findByIdAndUpdate(objectId, { valid: false }, { new: true }).exec();
  }
);

export type OAuth2CodeModel = Model<IOAuth2Code> & OAuth2CodeModelStatics;
export const OAuth2Code = model<IOAuth2Code, OAuth2CodeModel>('OAuth2Code', oauth2CodeSchema);

// ============================================================================
// OAuth2 Scope
// ============================================================================

const oauth2ScopeSchema = new Schema<IOAuth2Scope>(
  {
    name: { type: String, required: true },
    description: { type: String },
    valid: { type: Boolean, default: true },
    created: { type: Date, default: Date.now },
  },
  {
    timestamps: false,
  }
);

oauth2ScopeSchema.index({ name: 1 }, { unique: true });

interface OAuth2ScopeModelStatics {
  findByName(name: string): Promise<OAuth2ScopeDocument | null>;
}

oauth2ScopeSchema.static(
  'findByName',
  async function (name: string): Promise<OAuth2ScopeDocument | null> {
    return this.findOne({ name, valid: true }).exec();
  }
);

export type OAuth2ScopeModel = Model<IOAuth2Scope> & OAuth2ScopeModelStatics;
export const OAuth2Scope = model<IOAuth2Scope, OAuth2ScopeModel>('OAuth2Scope', oauth2ScopeSchema);
