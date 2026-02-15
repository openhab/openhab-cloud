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

import fs from 'fs';
import path from 'path';
import { ConfigSchema, type Config } from './schema';

export { ConfigSchema } from './schema';
export type {
  Config,
  SystemConfig,
  MongoDBConfig,
  RedisConfig,
  MailerConfig,
  GCMConfig,
  IFTTTConfig,
  LoggerConfig,
} from './schema';

/**
 * Load and validate configuration from a JSON file
 *
 * @param configPath - Path to the configuration file
 * @returns Validated configuration object
 * @throws Error if file not found or validation fails
 */
export function loadConfig(configPath: string): Config {
  const absolutePath = path.resolve(configPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Configuration file not found: ${absolutePath}`);
  }

  const fileContent = fs.readFileSync(absolutePath, 'utf-8');
  let rawConfig: unknown;

  try {
    rawConfig = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(`Invalid JSON in configuration file: ${absolutePath}`);
  }

  // Handle backward compatibility for baseurl
  const config = rawConfig as Record<string, unknown>;
  if (config['system'] && typeof config['system'] === 'object') {
    const system = config['system'] as Record<string, unknown>;
    if (system['baseurl'] && typeof system['baseurl'] === 'string') {
      let baseurl = system['baseurl'];

      // Add protocol if missing
      if (!baseurl.match(/^https?:\/\//)) {
        baseurl = 'http://' + baseurl;
      }

      try {
        const parsedUrl = new URL(baseurl);
        system['host'] = parsedUrl.hostname;
        system['port'] = parsedUrl.port || (parsedUrl.protocol === 'https:' ? '443' : '80');
        system['protocol'] = parsedUrl.protocol.replace(':', '');
      } catch {
        throw new Error(`Invalid baseurl in configuration: ${system['baseurl']}`);
      }
    }
  }

  const result = ConfigSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
    );
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }

  return result.data;
}

/**
 * System Configuration Manager
 *
 * Provides type-safe access to configuration values with sensible defaults.
 * Replaces the legacy throw-based system/index.js.
 */
export class SystemConfigManager {
  constructor(private readonly config: Config) {}

  /**
   * Get the configured host
   */
  getHost(): string {
    return this.config.system.host;
  }

  /**
   * Get the configured proxy host (falls back to host)
   */
  getProxyHost(): string {
    return this.config.system.proxyHost || this.config.system.host;
  }

  /**
   * Get the configured port
   */
  getPort(): number {
    return this.config.system.port;
  }

  /**
   * Get the configured proxy port (falls back to port)
   */
  getProxyPort(): number {
    return this.config.system.proxyPort || this.config.system.port;
  }

  /**
   * Get the port the Node process should listen on
   */
  getNodeProcessPort(): number {
    const port = parseInt(process.env['PORT'] || '3000', 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      return 3000;
    }
    return port;
  }

  /**
   * Get the configured protocol
   */
  getProtocol(): string {
    return this.config.system.protocol;
  }

  /**
   * Get the full base URL (omits port for standard http/https ports)
   */
  getBaseURL(): string {
    const protocol = this.getProtocol();
    const port = this.getPort();
    const isStandardPort = (protocol === 'https' && port === 443) || (protocol === 'http' && port === 80);
    return isStandardPort
      ? `${protocol}://${this.getHost()}`
      : `${protocol}://${this.getHost()}:${port}`;
  }

  /**
   * Get the full proxy URL (omits port for standard http/https ports)
   */
  getProxyURL(): string {
    const protocol = this.getProtocol();
    const port = this.getProxyPort();
    const isStandardPort = (protocol === 'https' && port === 443) || (protocol === 'http' && port === 80);
    return isStandardPort
      ? `${protocol}://${this.getProxyHost()}`
      : `${protocol}://${this.getProxyHost()}:${port}`;
  }

  /**
   * Check if notifications are muted
   */
  getMuteNotifications(): boolean {
    return this.config.system.muteNotifications;
  }

  /**
   * Get offline notification time in milliseconds
   */
  getOfflineNotificationTime(): number {
    return this.config.system.offlineNotificationTime;
  }

  /**
   * Get connection lock time in seconds
   */
  getConnectionLockTimeSeconds(): number {
    return this.config.system.connectionLockTimeSeconds;
  }

  /**
   * Check if user registration is enabled
   */
  isUserRegistrationEnabled(): boolean {
    return this.config.registration_enabled;
  }

  /**
   * Check if legal terms are configured
   */
  hasLegalTerms(): boolean {
    return !!(this.config.legal?.terms && this.config.legal.terms !== '');
  }

  /**
   * Check if legal policy is configured
   */
  hasLegalPolicy(): boolean {
    return !!(this.config.legal?.policy && this.config.legal.policy !== '');
  }

  /**
   * Check if IFTTT is enabled
   */
  isIFTTTEnabled(): boolean {
    return !!this.config.ifttt;
  }

  /**
   * Get Apple App Store link
   */
  getAppleLink(): string {
    return `https://itunes.apple.com/app/id${this.getAppleId()}`;
  }

  /**
   * Get Apple App ID
   */
  getAppleId(): string {
    return this.config.apps?.appleId || '492054521';
  }

  /**
   * Get Android Play Store link
   */
  getAndroidLink(): string {
    return `https://play.google.com/store/apps/details?id=${this.getAndroidId()}`;
  }

  /**
   * Get Android package ID
   */
  getAndroidId(): string {
    return this.config.apps?.playStoreId || 'org.openhab.habdroid';
  }

  /**
   * Check if GCM/FCM is configured
   */
  isGcmConfigured(): boolean {
    return !!(this.config.gcm?.senderId && this.config.gcm?.serviceFile);
  }

  /**
   * Get GCM sender ID
   */
  getGcmSenderId(): string {
    if (!this.config.gcm?.senderId) {
      throw new Error('GCM sender ID not configured');
    }
    return this.config.gcm.senderId;
  }

  /**
   * Get Firebase service file path
   */
  getFirebaseServiceFile(): string {
    if (!this.config.gcm?.serviceFile) {
      throw new Error('Firebase service file not configured');
    }
    return path.resolve(this.config.gcm.serviceFile);
  }

  /**
   * Check if database credentials are configured
   */
  hasDbCredentials(): boolean {
    return !!(this.config.mongodb.user && this.config.mongodb.password);
  }

  /**
   * Get database user
   */
  getDbUser(): string | undefined {
    return this.config.mongodb.user;
  }

  /**
   * Get database password
   */
  getDbPass(): string | undefined {
    return this.config.mongodb.password;
  }

  /**
   * Get database hosts as string
   */
  getDbHostsString(): string {
    return this.config.mongodb.hosts.join(',');
  }

  /**
   * Get database name
   */
  getDbName(): string {
    return this.config.mongodb.db;
  }

  /**
   * Get database auth source (e.g., 'admin')
   */
  getDbAuthSource(): string | undefined {
    return this.config.mongodb.authSource;
  }

  /**
   * Get internal address (host:port)
   */
  getInternalAddress(): string {
    const host = process.env['HOST'] || 'localhost';
    const port = process.env['PORT'] || '3000';
    return `${host}:${port}`;
  }

  /**
   * Get Morgan logger option
   */
  getLoggerMorganOption(): string | null {
    return this.config.system.logger.morgan || null;
  }

  /**
   * Check if health endpoint is enabled
   */
  isHealthEndpointEnabled(): boolean {
    return this.config.system.healthEndpoint.enabled;
  }

  /**
   * Get mailer configuration (if configured)
   */
  getMailerConfig() {
    return this.config.mailer;
  }

  /**
   * Get IFTTT channel key
   */
  getIftttChannelKey(): string {
    return this.config.ifttt?.iftttChannelKey ?? '';
  }

  /**
   * Get IFTTT test token
   */
  getIftttTestToken(): string {
    return this.config.ifttt?.iftttTestToken ?? '';
  }

  /**
   * Get Express session key
   */
  getExpressKey(): string {
    return this.config.express.key;
  }
}
