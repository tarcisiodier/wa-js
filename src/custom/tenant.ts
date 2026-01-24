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

import { Client } from '@libsql/client/web';

import { TENANT_SCHEMA } from './schemas/tenant';

/**
 * Initializes a tenant database with the standard schema.
 * @param client The LibSQL client connected to the tenant's database.
 */
export async function initializeTenant(client: Client) {
  try {
    console.log('WPP Custom: Initializing tenant schema...');

    // Split schema by semicolons to execute statements individually
    // LibSQL executeMultiple might be safer if available, but batch/splitting ensures compatibility
    // with different client versions or drivers.
    const statements = TENANT_SCHEMA.split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const sql of statements) {
      await client.execute(sql);
    }

    console.log('WPP Custom: Tenant schema initialized successfully.');
    return true;
  } catch (error) {
    console.error('WPP Custom: Failed to initialize tenant schema:', error);
    return false;
  }
}
