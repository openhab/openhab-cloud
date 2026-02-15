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

import winston from 'winston';
import type { Logger as WinstonLogger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import type { LoggerConfig } from '../config';
import type { ILogger } from '../types/notification';

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  level: string;
  dir: string;
  maxFiles: string;
  type: 'file' | 'console';
  processPort: number;
}

/**
 * Extended logger interface with audit support
 */
export interface AppLogger extends ILogger {
  audit(message: string, ...args: unknown[]): void;
  auditRequest(req: AuditableRequest): void;
}

/**
 * Request interface for audit logging
 */
interface AuditableRequest {
  user?: { username: string };
  connectionInfo?: { serverAddress: string };
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
}

// Custom log levels with audit
const levels: winston.config.AbstractConfigSetLevels = {
  error: 0,
  warn: 1,
  info: 2,
  verbose: 3,
  debug: 4,
  silly: 5,
  audit: 6,
};

/**
 * Create a configured Winston logger instance
 *
 * @param options - Logger configuration options
 * @returns Configured logger instance
 */
export function createLogger(options: LoggerOptions): AppLogger {
  const timeFormat = winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss:SSS',
  });

  const logFormat = winston.format.printf((info) => {
    return `${info['timestamp']} ${info.level}: ${info.message}`;
  });

  const transports: winston.transport[] = [];

  if (options.type === 'console') {
    // Console transport
    transports.push(
      new winston.transports.Console({
        handleExceptions: true,
        level: options.level,
        format: winston.format.combine(
          timeFormat,
          winston.format.splat(),
          logFormat
        ),
      })
    );
  } else {
    // File transport with daily rotation
    transports.push(
      new DailyRotateFile({
        filename: `${options.dir}openhab-cloud-%DATE%-process-${options.processPort}.log`,
        datePattern: 'YYYY-MM-DD',
        zippedArchive: false,
        maxFiles: options.maxFiles,
        handleExceptions: true,
        level: options.level,
        format: winston.format.combine(
          timeFormat,
          winston.format.splat(),
          logFormat
        ),
      })
    );
  }

  // Audit log transport (always file-based)
  const auditFilter = winston.format((info) => {
    if (info.level === 'audit') {
      return info;
    }
    return false;
  });

  transports.push(
    new DailyRotateFile({
      filename: `${options.dir}audit-%DATE%-process-${options.processPort}.log`,
      datePattern: 'YYYY-MM-DD',
      zippedArchive: false,
      maxFiles: options.maxFiles,
      level: 'audit',
      format: winston.format.combine(
        auditFilter(),
        timeFormat,
        winston.format.splat(),
        logFormat
      ),
    })
  );

  const winstonLogger = winston.createLogger({
    transports,
    exitOnError: false,
    levels,
  });

  // Create wrapper that implements AppLogger interface
  const logger: AppLogger = {
    error: (message: string, ...args: unknown[]) => {
      winstonLogger.error(message, ...args);
    },
    warn: (message: string, ...args: unknown[]) => {
      winstonLogger.warn(message, ...args);
    },
    info: (message: string, ...args: unknown[]) => {
      winstonLogger.info(message, ...args);
    },
    debug: (message: string, ...args: unknown[]) => {
      winstonLogger.debug(message, ...args);
    },
    audit: (message: string, ...args: unknown[]) => {
      winstonLogger.log('audit', message, ...args);
    },
    auditRequest: (req: AuditableRequest) => {
      const headers = req.headers;

      // Strip off path prefix for remote vhosts hack
      let requestPath = req.path;
      if (requestPath.indexOf('/remote/') === 0) {
        requestPath = requestPath.replace('/remote', '');
      }

      // Sanitize user-controlled values to prevent log injection
      const sanitize = (val: string | string[] | undefined): string => {
        if (!val) return 'unknown';
        const str = Array.isArray(val) ? val[0] || 'unknown' : val;
        // Remove newlines and pipe characters that could corrupt log format
        return str.replace(/[\r\n|]/g, '').substring(0, 500);
      };

      const username = req.user?.username || 'anonymous';
      const status = req.connectionInfo ? 'online' : 'offline';
      const realIp = sanitize(headers['x-real-ip']);
      const host = sanitize(headers['host']);
      const userAgent = sanitize(headers['user-agent']);

      logger.audit(
        '%s | %s | %s | %s | %s | %s | %s',
        username,
        status,
        req.method,
        sanitize(requestPath),
        realIp,
        host,
        userAgent
      );
    },
  };

  return logger;
}

/**
 * Create a logger from LoggerConfig
 *
 * @param config - Logger configuration from config file
 * @param processPort - The port the process is running on
 * @returns Configured logger instance
 */
export function createLoggerFromConfig(
  config: LoggerConfig,
  processPort: number
): AppLogger {
  let dir = config.dir;
  if (!dir.endsWith('/')) {
    dir += '/';
  }

  return createLogger({
    level: config.level,
    dir,
    maxFiles: config.maxFiles,
    type: config.type,
    processPort,
  });
}

