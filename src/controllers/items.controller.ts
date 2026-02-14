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
import type { IItem } from '../types/models';
import type { ILogger } from '../types/notification';

/**
 * Repository interface for Item operations
 */
export interface IItemRepositoryForItems {
  findByOpenhab(
    openhabId: string | Types.ObjectId,
    sort: 'name' | 'last_update' | 'status'
  ): Promise<IItem[]>;
}

/**
 * Items Controller
 *
 * Handles item viewing routes.
 */
export class ItemsController {
  constructor(
    private readonly itemRepository: IItemRepositoryForItems,
    private readonly logger: ILogger
  ) {}

  /**
   * GET /items
   *
   * Display items list with sorting options.
   */
  getItems: RequestHandler = async (req, res) => {
    try {
      const sortParam = req.query['sort'];
      let sort: 'name' | 'last_update' | 'status' = 'name';
      if (sortParam === 'last_update' || sortParam === 'status') {
        sort = sortParam;
      }

      if (!req.openhab) {
        req.flash('error', 'openHAB instance not found');
        return res.redirect('/');
      }

      const items = await this.itemRepository.findByOpenhab(req.openhab._id, sort);

      res.render('items', {
        items,
        title: 'Items',
        user: req.user,
        openhab: req.openhab,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting items:', error);
      req.flash('error', 'Error loading items');
      res.redirect('/');
    }
  };
}
