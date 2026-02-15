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
 * Date Utility Module
 *
 * Provides timezone-aware date formatting using Luxon.
 */

import { DateTime } from 'luxon';

/**
 * Convert a JavaScript Date or ISO string to a Luxon DateTime with the specified timezone.
 *
 * @param date - JavaScript Date object or ISO string
 * @param timezone - Olson timezone string (e.g., 'America/New_York'). Defaults to 'UTC'.
 * @returns Luxon DateTime object with the specified timezone
 */
function toTimezone(date: Date | string, timezone?: string): DateTime {
  const tz = timezone || 'UTC';

  if (typeof date === 'string') {
    return DateTime.fromISO(date).setZone(tz);
  }

  return DateTime.fromJSDate(date).setZone(tz);
}

/**
 * Legacy-compatible date utility function.
 * This is the default export for backwards compatibility with EJS templates.
 */
export default function dateUtil(date: Date | string, timezone?: string): DateTime {
  return toTimezone(date, timezone);
}
