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
 * Make Admin CLI Tool
 *
 * Makes a user a member of the staff group.
 *
 * Usage: npx tsx src/cli/makeadmin.ts <username>
 */

import { connectToDatabase, disconnectFromDatabase } from './db-connect';
import { User } from '../models';

async function main(): Promise<void> {
  const username = process.argv[2];

  if (!username) {
    console.log('Usage: npx tsx src/cli/makeadmin.ts <username>');
    process.exit(1);
  }

  try {
    await connectToDatabase();

    const user = await User.findOne({ username });

    if (!user) {
      console.log(`User "${username}" not found!`);
      process.exit(1);
    }

    console.log(`Found user "${username}", making them staff...`);
    user.group = 'staff';
    await user.save();

    console.log(`Successfully made "${username}" a staff member.`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await disconnectFromDatabase();
  }
}

main();
