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
 * Update License Headers
 *
 * Adds or updates the EPL-2.0 license header in all TypeScript files.
 * Run with: npm run license:update
 */

import * as fs from 'fs';
import * as path from 'path';

const START_YEAR = 2010;
const CURRENT_YEAR = new Date().getFullYear();

const LICENSE_HEADER = `/*
 * Copyright (c) ${START_YEAR}-${CURRENT_YEAR} Contributors to the openHAB project
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
`;

// Regex to match existing license header (with any year range)
// Handles optional shebang line at start
const LICENSE_REGEX = /^(#!.*\n)?\/\*\s*\n\s*\*\s*Copyright \(c\) \d{4}-\d{4} Contributors to the openHAB project[\s\S]*?SPDX-License-Identifier: EPL-2\.0\s*\n\s*\*\/\n*/;

// Directories to process
const DIRECTORIES = ['src', 'tests', 'scripts'];

// Directories to skip
const SKIP_DIRS = ['node_modules', 'dist', 'coverage', '.nyc_output'];

function findTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.includes(entry.name)) {
        files.push(...findTypeScriptFiles(fullPath));
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function hasLicenseHeader(content: string): boolean {
  return LICENSE_REGEX.test(content);
}

function updateLicenseHeader(content: string): string {
  // Check for shebang
  let shebang = '';
  let contentToProcess = content;

  if (content.startsWith('#!')) {
    const newlineIndex = content.indexOf('\n');
    shebang = content.substring(0, newlineIndex + 1);
    contentToProcess = content.substring(newlineIndex + 1);
  }

  // Remove existing header if present (without shebang since we extracted it)
  const headerOnlyRegex = /^\/\*\s*\n\s*\*\s*Copyright \(c\) \d{4}-\d{4} Contributors to the openHAB project[\s\S]*?SPDX-License-Identifier: EPL-2\.0\s*\n\s*\*\/\n*/;
  const withoutHeader = contentToProcess.replace(headerOnlyRegex, '');

  // Add new header (with shebang if present)
  if (shebang) {
    return shebang + LICENSE_HEADER + '\n' + withoutHeader.trimStart();
  }
  return LICENSE_HEADER + '\n' + withoutHeader.trimStart();
}

function addLicenseHeader(content: string): string {
  // Handle shebang lines
  if (content.startsWith('#!')) {
    const newlineIndex = content.indexOf('\n');
    const shebang = content.substring(0, newlineIndex + 1);
    const rest = content.substring(newlineIndex + 1).trimStart();
    return shebang + '\n' + LICENSE_HEADER + '\n' + rest;
  }

  return LICENSE_HEADER + '\n' + content.trimStart();
}

function processFile(filePath: string, dryRun: boolean): { action: string; file: string } {
  const content = fs.readFileSync(filePath, 'utf-8');

  let newContent: string;
  let action: string;

  if (hasLicenseHeader(content)) {
    newContent = updateLicenseHeader(content);
    action = 'updated';
  } else {
    newContent = addLicenseHeader(content);
    action = 'added';
  }

  // Check if content actually changed
  if (content === newContent) {
    return { action: 'unchanged', file: filePath };
  }

  if (!dryRun) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }

  return { action, file: filePath };
}

function main(): void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose') || args.includes('-v');

  if (dryRun) {
    console.log('Dry run mode - no files will be modified\n');
  }

  console.log(`License header year range: ${START_YEAR}-${CURRENT_YEAR}\n`);

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let total = 0;

  for (const dir of DIRECTORIES) {
    const files = findTypeScriptFiles(dir);

    for (const file of files) {
      total++;
      const result = processFile(file, dryRun);

      switch (result.action) {
        case 'added':
          added++;
          if (verbose) console.log(`+ Added:     ${result.file}`);
          break;
        case 'updated':
          updated++;
          if (verbose) console.log(`~ Updated:   ${result.file}`);
          break;
        case 'unchanged':
          unchanged++;
          if (verbose) console.log(`  Unchanged: ${result.file}`);
          break;
      }
    }
  }

  console.log('\nSummary:');
  console.log(`  Total files:  ${total}`);
  console.log(`  Added:        ${added}`);
  console.log(`  Updated:      ${updated}`);
  console.log(`  Unchanged:    ${unchanged}`);

  if (dryRun && (added > 0 || updated > 0)) {
    console.log('\nRun without --dry-run to apply changes.');
  }
}

main();
