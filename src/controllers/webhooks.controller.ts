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

import type { RequestHandler } from 'express';
import type { Types } from 'mongoose';
import type { IWebhook } from '../types/models';
import type { ILogger } from '../types/notification';

/**
 * Repository interface for Webhook operations
 */
export interface IWebhookRepositoryForWebhooks {
  findByOpenhab(openhabId: string | Types.ObjectId): Promise<IWebhook[]>;
  findByIdAndOpenhab(
    id: string | Types.ObjectId,
    openhabId: string | Types.ObjectId
  ): Promise<IWebhook | null>;
  deleteById(id: string | Types.ObjectId): Promise<void>;
}

/**
 * System configuration interface
 */
export interface IWebhooksSystemConfig {
  getBaseURL(): string;
}

/**
 * Webhooks Controller
 *
 * Handles webhook management routes — listing and deleting webhooks registered
 * by the user's openHAB binding.
 */
export class WebhooksController {
  constructor(
    private readonly webhookRepository: IWebhookRepositoryForWebhooks,
    private readonly systemConfig: IWebhooksSystemConfig,
    private readonly logger: ILogger
  ) {}

  /**
   * GET /webhooks
   *
   * Display list of webhooks registered for the user's openHAB.
   */
  getWebhooks: RequestHandler = async (req, res) => {
    try {
      if (!req.user || !req.openhab) {
        return res.redirect('/login');
      }

      const webhooks = await this.webhookRepository.findByOpenhab(req.openhab._id);
      const baseURL = this.systemConfig.getBaseURL().replace(/\/+$/, '');

      const webhooksWithUrls = webhooks.map((webhook) => ({
        ...webhook,
        url: `${baseURL}/api/hooks/${webhook.uuid}`,
      }));

      res.render('webhooks', {
        webhooks: webhooksWithUrls,
        title: 'Webhooks',
        user: req.user,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting webhooks:', error);
      req.flash('error', 'Error loading webhooks');
      res.redirect('/');
    }
  };

  /**
   * GET /webhooks/:id/delete
   *
   * Delete a webhook belonging to the user's openHAB.
   */
  deleteWebhook: RequestHandler = async (req, res) => {
    const idParam = req.params['id'];

    if (!idParam || typeof idParam !== 'string') {
      return res.redirect('/webhooks');
    }

    // Validate ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(idParam)) {
      req.flash('error', 'Invalid webhook ID');
      return res.redirect('/webhooks');
    }

    try {
      if (!req.user || !req.openhab) {
        return res.redirect('/login');
      }

      const webhook = await this.webhookRepository.findByIdAndOpenhab(
        idParam,
        req.openhab._id
      );

      if (webhook) {
        await this.webhookRepository.deleteById(webhook._id);
        this.logger.info(`Deleted webhook ${idParam}`);
        req.flash('info', 'Webhook deleted');
      } else {
        req.flash('error', 'Webhook not found');
      }

      res.redirect('/webhooks');
    } catch (error) {
      this.logger.error('Error deleting webhook:', error);
      req.flash('error', 'Error deleting webhook');
      res.redirect('/webhooks');
    }
  };
}
