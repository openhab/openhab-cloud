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
 * Make Invitations CLI Tool
 *
 * Creates invitation codes for new users.
 *
 * Usage: npx tsx src/cli/makeinvites.ts [count] [email]
 *
 * Arguments:
 *   count - Number of invitations to create (default: 10)
 *   email - Email address for invitations (default: openhab@openhab.org)
 */

import { connectToDatabase, disconnectFromDatabase } from './db-connect';
import { Invitation } from '../models';

async function main(): Promise<void> {
  const count = parseInt(process.argv[2] || '10', 10);
  const email = process.argv[3] || 'openhab@openhab.org';

  if (isNaN(count) || count < 1) {
    console.log('Usage: npx tsx src/cli/makeinvites.ts [count] [email]');
    console.log('  count - Number of invitations to create (default: 10)');
    console.log('  email - Email address for invitations (default: openhab@openhab.org)');
    process.exit(1);
  }

  try {
    await connectToDatabase();

    console.log(`Creating ${count} invitation(s) for "${email}"...`);

    const invitations: string[] = [];

    for (let i = 0; i < count; i++) {
      const invitation = await Invitation.createInvitation(email);
      invitations.push(invitation.code);
      console.log(`Created invitation: ${invitation.code}`);
    }

    console.log('\n--- Summary ---');
    console.log(`Created ${invitations.length} invitation(s):`);
    invitations.forEach((code, index) => {
      console.log(`  ${index + 1}. ${code}`);
    });
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await disconnectFromDatabase();
  }
}

main();
