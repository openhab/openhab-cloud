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
import type { INotification } from '../types/models';
import type { ILogger } from '../types/notification';

/**
 * Repository interface for Notification view operations
 */
export interface INotificationRepositoryForView {
  findByUser(
    userId: string | Types.ObjectId,
    options: { limit: number; skip: number }
  ): Promise<INotification[]>;
  count(): Promise<number>;
}

/**
 * Notifications View Controller
 *
 * Handles notification viewing routes (web UI).
 * Note: This is separate from ApiController which handles REST API notifications.
 */
export class NotificationsViewController {
  private readonly perPage = 20;

  constructor(
    private readonly notificationRepository: INotificationRepositoryForView,
    private readonly logger: ILogger
  ) {}

  /**
   * GET /notifications
   *
   * Display paginated notifications list.
   */
  getNotifications: RequestHandler = async (req, res) => {
    try {
      const page = Math.max(0, parseInt(req.query['page'] as string) || 0);

      if (!req.user) {
        return res.redirect('/login');
      }

      const notifications = await this.notificationRepository.findByUser(req.user._id, {
        limit: this.perPage,
        skip: this.perPage * page,
      });

      const count = await this.notificationRepository.count();

      res.render('notifications', {
        notifications,
        pages: Math.ceil(count / this.perPage),
        page,
        title: 'Notifications',
        user: req.user,
        openhab: req.openhab,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting notifications:', error);
      req.flash('error', 'Error loading notifications');
      res.redirect('/');
    }
  };
}
