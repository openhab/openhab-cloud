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
 * CLI Tools Index
 *
 * This module exports utilities for CLI tools.
 * Individual CLI tools are standalone scripts in this directory.
 *
 * Available CLI tools:
 * - makeadmin.ts  - Make a user a staff member
 * - makeinvites.ts - Create invitation codes
 *
 * Usage:
 *   npx tsx src/cli/makeadmin.ts <username>
 *   npx tsx src/cli/makeinvites.ts [count] [email]
 */

export { connectToDatabase, disconnectFromDatabase } from './db-connect';
