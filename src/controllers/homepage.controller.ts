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

/**
 * Homepage Controller
 *
 * Handles home page rendering.
 */
export class HomepageController {
  /**
   * GET /
   *
   * Display the home page.
   */
  index: RequestHandler = (req, res) => {
    res.render('index', {
      title: 'Home',
      user: req.user,
      errormessages: req.flash('error'),
      infomessages: req.flash('info'),
    });
  };
}
