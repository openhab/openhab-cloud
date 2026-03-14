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

import type { Request, Response, NextFunction } from 'express';
import type { SystemConfigManager } from '../config';

/**
 * Create vhost detection middleware.
 * Sets req.isVhostProxy when the hostname matches the configured proxyHost
 * or the "remote.<mainHost>" convention.
 */
export function createVhostDetection(configManager: SystemConfigManager) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const host = req.hostname?.toLowerCase();
    if (host) {
      const proxyHost = configManager.getProxyHost().toLowerCase();
      const mainHost = configManager.getHost().toLowerCase();
      if (
        (proxyHost !== mainHost && host === proxyHost) ||
        host === `remote.${mainHost}`
      ) {
        req.isVhostProxy = true;
      }
    }
    next();
  };
}
