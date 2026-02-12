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

import path from 'path';
import type { MailerConfig } from '../config';
import type { ILogger } from '../types/notification';

/**
 * Email template locals
 */
export interface EmailLocals {
  [key: string]: unknown;
}

/**
 * Mailer interface
 */
export interface IMailer {
  sendEmail(
    to: string,
    subject: string,
    templateName: string,
    locals: EmailLocals
  ): Promise<void>;
}

/**
 * Create a mailer instance
 *
 * @param config - Mailer configuration (null for development mode)
 * @param logger - Logger instance
 * @param templatesDir - Directory containing email templates
 * @returns Mailer instance
 */
export function createMailer(
  config: MailerConfig | undefined,
  logger: ILogger,
  templatesDir?: string
): IMailer {
  const isProduction = process.env['NODE_ENV'] === 'production';

  if (!isProduction || !config) {
    logger.info('Mailer will emulate sending in development environment');
    return createDevMailer(logger);
  }

  return createProductionMailer(config, logger, templatesDir);
}

/**
 * Create a production mailer that actually sends emails
 */
function createProductionMailer(
  config: MailerConfig,
  logger: ILogger,
  templatesDir?: string
): IMailer {
  // Dynamic imports for nodemailer and email-templates
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nodemailer = require('nodemailer') as typeof import('nodemailer');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Email = require('email-templates') as typeof import('email-templates');

  const resolvedTemplatesDir = templatesDir || path.resolve(process.cwd(), 'templates');

  return {
    async sendEmail(
      to: string,
      subject: string,
      templateName: string,
      locals: EmailLocals
    ): Promise<void> {
      try {
        const smtpConfig: {
          host: string;
          port: number;
          secure: boolean;
          auth?: { user: string; pass: string };
        } = {
          host: config.host,
          port: config.port,
          secure: config.secureConnection,
        };

        if (config.user) {
          smtpConfig.auth = {
            user: config.user,
            pass: config.password || '',
          };
        }

        const transport = nodemailer.createTransport(smtpConfig);

        const message = {
          from: config.from,
          to,
          subject,
          generateTextFromHTML: true,
        };

        const emailSender = new Email({
          views: {
            root: resolvedTemplatesDir,
            options: {
              extension: 'ejs',
            },
          },
          transport,
        });

        await emailSender.send({
          template: templateName,
          message,
          locals,
        });

        logger.info(`Email sent to ${to}: ${subject}`);
      } catch (error) {
        logger.error(`Error sending email to ${to}:`, error);
        throw error;
      }
    },
  };
}

/**
 * Create a development mailer that logs instead of sending
 */
function createDevMailer(logger: ILogger): IMailer {
  return {
    async sendEmail(
      to: string,
      subject: string,
      templateName: string,
      _locals: EmailLocals
    ): Promise<void> {
      logger.info(`[DEV] Emulating sendEmail to ${to} about ${subject} (template: ${templateName})`);
    },
  };
}

/**
 * Create a no-op mailer for testing
 */
export function createNullMailer(): IMailer {
  return {
    async sendEmail(): Promise<void> {
      // No-op
    },
  };
}

/**
 * Create a mock mailer that captures sent emails for testing
 */
export function createMockMailer(): IMailer & { getSentEmails(): SentEmail[] } {
  const sentEmails: SentEmail[] = [];

  return {
    async sendEmail(
      to: string,
      subject: string,
      templateName: string,
      locals: EmailLocals
    ): Promise<void> {
      sentEmails.push({ to, subject, templateName, locals });
    },
    getSentEmails(): SentEmail[] {
      return sentEmails;
    },
  };
}

interface SentEmail {
  to: string;
  subject: string;
  templateName: string;
  locals: EmailLocals;
}
