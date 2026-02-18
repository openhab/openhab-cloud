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

import { z } from 'zod';

/**
 * System configuration schema
 */
const SystemSchema = z.object({
  host: z.string().min(1),
  listenIp: z.string().default('0.0.0.0'),
  port: z.coerce.number().int().positive().default(3000),
  protocol: z.enum(['http', 'https']).default('https'),
  proxyHost: z.string().optional(),
  proxyPort: z.coerce.number().int().positive().optional(),
  subDomainCookies: z.boolean().default(false),
  muteNotifications: z.boolean().default(false),
  offlineNotificationTime: z.number().default(300000), // 5 minutes in ms
  connectionLockTimeSeconds: z.number().default(70),
  logger: z.object({
    dir: z.string().default('./logs/'),
    maxFiles: z.string().default('7d'),
    level: z.enum(['error', 'warn', 'info', 'verbose', 'debug', 'silly']).default('debug'),
    type: z.enum(['file', 'console', 'both']).default('file'),
    morgan: z.string().nullable().optional(),
  }).default({
    dir: './logs/',
    maxFiles: '7d',
    level: 'debug',
    type: 'file',
  }),
  healthEndpoint: z.object({
    enabled: z.boolean().default(false),
  }).default({
    enabled: false,
  }),
});

/**
 * Express configuration schema
 */
const ExpressSchema = z.object({
  key: z.string().min(1),
});

/**
 * MongoDB configuration schema
 */
const MongoDBSchema = z.object({
  hosts: z.array(z.string()).min(1),
  db: z.string().min(1),
  user: z.string().optional(),
  password: z.string().optional(),
  authSource: z.string().optional(),
});

/**
 * Redis configuration schema
 */
const RedisSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive().default(6379),
  password: z.string().optional(),
});

/**
 * Mailer configuration schema
 */
const MailerSchema = z.object({
  host: z.string().min(1),
  port: z.coerce.number().int().positive().default(465),
  secureConnection: z.boolean().default(true),
  user: z.string().optional(),
  password: z.string().optional(),
  from: z.string().min(1),
}).optional();

/**
 * GCM/FCM configuration schema
 */
const GCMSchema = z.object({
  senderId: z.string().min(1),
  serviceFile: z.string().min(1),
}).optional();

/**
 * IFTTT configuration schema
 */
const IFTTTSchema = z.object({
  iftttChannelKey: z.string().min(1),
  iftttTestToken: z.string().optional(),
}).optional();

/**
 * Legal links configuration schema
 */
const LegalSchema = z.object({
  terms: z.string().optional(),
  policy: z.string().optional(),
}).optional();

/**
 * App store IDs configuration schema
 */
const AppsSchema = z.object({
  appleId: z.string().default('492054521'),
  playStoreId: z.string().default('org.openhab.habdroid'),
}).optional();

/**
 * Complete configuration schema
 */
export const ConfigSchema = z.object({
  system: SystemSchema,
  express: ExpressSchema,
  mongodb: MongoDBSchema,
  redis: RedisSchema,
  mailer: MailerSchema,
  gcm: GCMSchema,
  ifttt: IFTTTSchema,
  legal: LegalSchema,
  apps: AppsSchema,
  registration_enabled: z.boolean().default(true),
});

/**
 * Inferred configuration type
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Inferred system configuration type
 */
export type SystemConfig = z.infer<typeof SystemSchema>;

/**
 * Inferred MongoDB configuration type
 */
export type MongoDBConfig = z.infer<typeof MongoDBSchema>;

/**
 * Inferred Redis configuration type
 */
export type RedisConfig = z.infer<typeof RedisSchema>;

/**
 * Inferred mailer configuration type
 */
export type MailerConfig = NonNullable<z.infer<typeof MailerSchema>>;

/**
 * Inferred GCM configuration type
 */
export type GCMConfig = NonNullable<z.infer<typeof GCMSchema>>;

/**
 * Inferred IFTTT configuration type
 */
export type IFTTTConfig = NonNullable<z.infer<typeof IFTTTSchema>>;

/**
 * Logger configuration type
 */
export type LoggerConfig = SystemConfig['logger'];
