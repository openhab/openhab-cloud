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

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import Email from 'email-templates';
import path from 'path';
import type { ILogger } from '../types/notification';

/**
 * SMTP configuration
 */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/**
 * Email service configuration
 */
export interface EmailServiceConfig {
  smtp: SmtpConfig;
  templatesDir: string;
  isDevelopment: boolean;
}

/**
 * Email Service
 *
 * Handles sending emails using nodemailer and email-templates.
 * In development mode, emails are logged but not actually sent.
 */
export class EmailService {
  private transport: Transporter | null = null;
  private emailSender: Email | null = null;

  constructor(
    private readonly config: EmailServiceConfig,
    private readonly logger: ILogger
  ) {
    this.initialize();
  }

  private initialize(): void {
    if (this.config.isDevelopment) {
      this.logger.info('EmailService: Running in development mode (emails will be emulated)');
      return;
    }

    try {
      const smtpOptions: nodemailer.TransportOptions = {
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure,
        tls: {
          rejectUnauthorized: false,
        },
      } as nodemailer.TransportOptions;

      if (this.config.smtp.user) {
        (smtpOptions as Record<string, unknown>)['auth'] = {
          user: this.config.smtp.user,
          pass: this.config.smtp.password,
        };
      }

      this.transport = nodemailer.createTransport(smtpOptions);

      this.emailSender = new Email({
        views: {
          root: this.config.templatesDir,
          options: {
            extension: 'ejs',
          },
        },
        transport: this.transport,
      });

      this.logger.info('EmailService: Initialized successfully');
    } catch (error) {
      this.logger.error('EmailService: Initialization error:', error);
    }
  }

  /**
   * Send an email using a template
   *
   * @param to - Recipient email address
   * @param subject - Email subject
   * @param template - Template name (without extension)
   * @param locals - Template variables
   */
  async sendEmail(
    to: string,
    subject: string,
    template: string,
    locals: Record<string, unknown>
  ): Promise<void> {
    if (this.config.isDevelopment) {
      this.logger.info(`EmailService: [DEV] Would send "${subject}" to ${to} using template "${template}"`);
      this.logger.debug('EmailService: [DEV] Template locals:', locals);
      return;
    }

    if (!this.emailSender) {
      throw new Error('EmailService not properly initialized');
    }

    try {
      await this.emailSender.send({
        template,
        message: {
          from: this.config.smtp.from,
          to,
          subject,
        },
        locals,
      });

      this.logger.info(`EmailService: Sent "${subject}" to ${to}`);
    } catch (error) {
      this.logger.error(`EmailService: Failed to send "${subject}" to ${to}:`, error);
      throw error;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    const locals = {
      email,
      resetUrl,
    };

    await this.sendEmail(email, 'Password recovery', 'lostpassword-email', locals);
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(email: string, verifyUrl: string): Promise<void> {
    const locals = {
      email,
      verifyUrl,
    };

    await this.sendEmail(email, 'Email Verification', 'activation-email', locals);
  }

}

/**
 * Create an EmailService from app config
 *
 * @param config - Application configuration object
 * @param logger - Logger instance
 * @param templatesDir - Path to email templates directory
 */
export function createEmailService(
  config: {
    mailer?: {
      host: string;
      port: number;
      secureConnection?: boolean;
      user?: string;
      password?: string;
      from: string;
    };
  },
  logger: ILogger,
  templatesDir?: string
): EmailService {
  const isDevelopment = process.env['NODE_ENV'] !== 'production';
  const defaultTemplatesDir = path.resolve(process.cwd(), 'templates');

  const emailConfig: EmailServiceConfig = {
    smtp: {
      host: config.mailer?.host ?? 'localhost',
      port: config.mailer?.port ?? 25,
      secure: config.mailer?.secureConnection ?? false,
      user: config.mailer?.user,
      password: config.mailer?.password,
      from: config.mailer?.from ?? 'noreply@openhab.org',
    },
    templatesDir: templatesDir ?? defaultTemplatesDir,
    isDevelopment,
  };

  return new EmailService(emailConfig, logger);
}
