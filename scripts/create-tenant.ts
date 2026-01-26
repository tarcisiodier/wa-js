/*!
 * Copyright 2024 WPPConnect Team
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

import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Import Schema directly or from the source
// Note: We're running in ts-node, so we can import the source file directly.
import { initializeTenant } from '../src/custom/tenant';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const TURSO_API_TOKEN = process.env.TURSO_API_TOKEN;
const TURSO_ORG = process.env.TURSO_ORG;

if (!TURSO_API_TOKEN || !TURSO_ORG) {
  console.error('Error: TURSO_API_TOKEN or TURSO_ORG missing in .env');
  process.exit(1);
}

const args = process.argv.slice(2);
const tenantName = args[0];
const groupName = args[1] || 'default';

if (!tenantName) {
  console.error('Usage: npm run create-tenant <tenant-name> [group-name]');
  process.exit(1);
}

const BASE_URL = 'https://api.turso.tech/v1';

async function createDatabase(name: string, group: string) {
  console.log(`Creating database '${name}' in group '${group}'...`);
  const response = await fetch(
    `${BASE_URL}/organizations/${TURSO_ORG}/databases`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TURSO_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, group }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to create database: ${err}`);
  }

  const data = await response.json();
  return data.database;
}

async function createToken(dbName: string) {
  console.log(`Creating token for database '${dbName}'...`);
  // Note: Endpoint format might vary based on Turso API version
  // v1: /organizations/{org}/databases/{db}/tokens
  const response = await fetch(
    `${BASE_URL}/organizations/${TURSO_ORG}/databases/${dbName}/tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TURSO_API_TOKEN}`,
      },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to create token: ${err}`);
  }

  const data = await response.json();
  return data.jwt;
}

async function main() {
  try {
    // 1. Create DB
    const dbInfo = await createDatabase(tenantName, groupName);
    const dbUrl = `libsql://${dbInfo.Hostname}`;

    console.log(`Database created! URL: ${dbUrl}`);

    // 2. Create Token
    const dbToken = await createToken(tenantName);
    console.log('Token created.');

    // 3. Initialize Schema
    console.log('Initializing schema...');

    // We need to use Http driver for scripts usually, createClient handles it based on URL protocol
    const client = createClient({
      url: dbUrl,
      authToken: dbToken,
    });

    const initialized = await initializeTenant(client);

    if (initialized) {
      console.log('\n--- SUCCESS ---');
      console.log(`Tenant Name: ${tenantName}`);
      console.log(`DB URL:      ${dbUrl}`);
      console.log(`DB Token:    ${dbToken}`);
      console.log('Schema:      Applied');
      console.log('----------------');
    } else {
      console.error('\n--- SCHEMA INIT FAILED ---');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
