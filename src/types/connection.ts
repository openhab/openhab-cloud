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

/**
 * Connection Types
 *
 * Types related to openHAB connections.
 */

/**
 * Connection info stored in Redis for each connected openHAB
 */
export interface ConnectionInfo {
  status?: string;
  serverAddress?: string;
  openhabVersion?: string;
  socketId?: string;
  connectedAt?: string;
}
