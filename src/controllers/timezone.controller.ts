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
 * Timezone Controller
 *
 * Handles session timezone setting.
 */
export class TimezoneController {
  /**
   * ALL /setTimezone
   *
   * Set the session timezone from query parameter.
   */
  setTimezone: RequestHandler = (req, res) => {
    const tz = req.query['tz'];
    if (typeof tz === 'string') {
      (req.session as { timezone?: string }).timezone = tz;
    }
    res.status(200).send('Timezone set');
  };
}
