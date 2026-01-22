/*!
 * Copyright 2022 WPPConnect Team
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as shell from 'shelljs';

// Configuration
const UPSTREAM_URL = 'https://github.com/wppconnect-team/wa-js.git';
const UPSTREAM_REMOTE = 'upstream';
const MAIN_BRANCH = 'main';
const FEATURES_BRANCH = 'features';
const INDEX_FILE_PATH = path.resolve(__dirname, '../index.ts');
const CUSTOM_EXPORT_LINE = "export * as custom from './custom';";

shell.config.verbose = true;

// Helper to check for errors
function checkError(code: number, msg: string) {
  if (code !== 0) {
    shell.echo(`Error: ${msg}`);
    shell.exit(1);
  }
}

// 1. Check/Add Upstream Remote
shell.echo('--- Checking/Adding Upstream Remote ---');
const remotes = shell.exec('git remote -v', { silent: true }).stdout;
if (!remotes.includes(UPSTREAM_REMOTE)) {
  shell.echo(`Adding remote ${UPSTREAM_REMOTE}...`);
  const addRemote = shell.exec(
    `git remote add ${UPSTREAM_REMOTE} ${UPSTREAM_URL}`
  );
  checkError(addRemote.code, 'Failed to add upstream remote');
} else {
  shell.echo(`Remote ${UPSTREAM_REMOTE} already exists.`);
}

// 2. Fetch Upstream
shell.echo('--- Fetching Upstream ---');
const fetch = shell.exec(`git fetch ${UPSTREAM_REMOTE}`);
checkError(fetch.code, 'Failed to fetch upstream');

// 3. Checkout and Reset Main (Mirror Upstream)
shell.echo(
  `--- Resetting ${MAIN_BRANCH} to match ${UPSTREAM_REMOTE}/${MAIN_BRANCH} ---`
);
const checkoutMain = shell.exec(`git checkout ${MAIN_BRANCH}`);
checkError(checkoutMain.code, `Failed to checkout ${MAIN_BRANCH}`);

const resetMain = shell.exec(
  `git reset --hard ${UPSTREAM_REMOTE}/${MAIN_BRANCH}`
);
checkError(resetMain.code, `Failed to reset ${MAIN_BRANCH} to upstream`);

// 4. Checkout Features and Merge Main
shell.echo(`--- Merging ${MAIN_BRANCH} into ${FEATURES_BRANCH} ---`);
const checkoutFeatures = shell.exec(`git checkout ${FEATURES_BRANCH}`);
checkError(checkoutFeatures.code, `Failed to checkout ${FEATURES_BRANCH}`);

// Determine merge strategy - typically we want to merge upstream changes into our features
const merge = shell.exec(`git merge ${MAIN_BRANCH}`);
if (merge.code !== 0) {
  shell.echo(
    `Warning: Merge conflict or error occurred. Please resolve manually.`
  );
  // We exit here to let user resolve conflicts, but we could try to continue if desired.
  // For safety, exiting is better.
  shell.exit(1);
}

// 5. Inject Custom Export if Missing
shell.echo('--- Checking/Injecting Custom Export ---');
if (fs.existsSync(INDEX_FILE_PATH)) {
  const content = fs.readFileSync(INDEX_FILE_PATH, 'utf8');
  if (!content.includes(CUSTOM_EXPORT_LINE)) {
    shell.echo('Custom export missing. Injecting...');
    // Add before the last export or at the end
    // Based on file structure, we can verify where it fits best.
    // For simplicity, appending it before the specific exports or at a known location is good.
    // The previous file view showed it near line 47.

    // We will append it before the final blank line or exports block if possible,
    // or just append to end of imports/exports section.
    // Let's match the user's file structure: inserted after 'export * as order ...' or similar.

    // Simple approach: Replace a known anchor or append.
    // The user had it around line 47.

    const lines = content.split('\n');
    let inserted = false;

    // Try to insert after the last 'export * as' line for cleanliness
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim().startsWith('export * as')) {
        lines.splice(i + 1, 0, CUSTOM_EXPORT_LINE);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      // Fallback: append to end
      lines.push(CUSTOM_EXPORT_LINE);
    }

    fs.writeFileSync(INDEX_FILE_PATH, lines.join('\n'));
    shell.echo('Custom export injected successfully.');

    // Commit the injection if it changed
    shell.exec(`git add ${INDEX_FILE_PATH}`);
    shell.exec(`git commit -m "chore: reinject custom export"`);
  } else {
    shell.echo('Custom export already present.');
  }
} else {
  checkError(1, `File not found: ${INDEX_FILE_PATH}`);
}

shell.echo('--- Sync Fork Completed Successfully ---');
