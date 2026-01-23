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

import { createClient } from '@libsql/client/web';

const DB_URL = process.env.DB_URL;
const DB_TOKEN = process.env.DB_TOKEN;

if (!DB_URL || !DB_TOKEN) {
  console.error(
    'WPP Custom: DB_URL or DB_TOKEN missing in environment variables.'
  );
}

// Create client
const client = createClient({
  url: DB_URL || '',
  authToken: DB_TOKEN || '',
});

/**
 * Initialize the database table if it doesn't exist
 */
/**
 * Initialize the database table if it doesn't exist
 */
export async function initTable() {
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wid TEXT UNIQUE,
        lid TEXT UNIQUE,
        name TEXT,
        phone TEXT,
        phoneBR TEXT,
        there_is BOOLEAN,
        link TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('WPP Custom: Table contacts ready.');
  } catch (error) {
    console.error('WPP Custom: Error creating table:', error);
  }
}

/**
 * Save checking result to database
 */
export async function saveContact(data: {
  there_is: boolean;
  data: {
    wid: string | null;
    lid: string | null;
    name: string | null;
    phone: string | null;
    phoneBR: string | null;
    link: (string | null)[];
  };
}) {
  try {
    const { there_is, data: info } = data;
    const linkStr = JSON.stringify(info.link);

    // Strategy: Try to insert. If conflict on WID or LID, update.
    // Since we have two unique keys (wid, lid), standard ON CONFLICT might be tricky if we don't know which one caused it.
    // But typically WID is the main identifier for existing contacts.

    // For "there_is=false", WID is null. We might resort to phone uniqueness or just insert (logs).
    // The user doc says 'wid' and 'lid' are UNIQUE (can be NULL). SQLite allows multiple NULLs in UNIQUE columns usually.
    // So if WID is null, we can have duplicates of non-existing numbers unless PHONE is unique.
    // TURSO-DB.md indices section says only wid and lid are unique.

    // Let's try a logic:
    // If wid exists, upsert on wid.
    // If only phone exists (there_is=false), we just insert (or maybe check if phone exists via SELECT first to update?)

    // Simplest approach aligned with doc:
    // If we have WID, use it for conflict.

    if (info.wid) {
      await client.execute({
        sql: `INSERT INTO contacts (wid, lid, name, phone, phoneBR, there_is, link, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(wid) DO UPDATE SET
                  lid = excluded.lid,
                  name = excluded.name,
                  phone = excluded.phone,
                  phoneBR = excluded.phoneBR,
                  there_is = excluded.there_is,
                  link = excluded.link,
                  updated_at = CURRENT_TIMESTAMP`,
        args: [
          info.wid,
          info.lid,
          info.name,
          info.phone,
          info.phoneBR,
          there_is,
          linkStr,
        ],
      });
    } else {
      // If no WID (contact probably doesn't exist), just insert.
      // Note: multiple checks for same phone will create multiple rows since phone is not UNIQUE in doc.
      // We might want to check existence by phone if desired, but sticking to doc schema strictly.
      await client.execute({
        sql: `INSERT INTO contacts (wid, lid, name, phone, phoneBR, there_is, link, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        args: [
          info.wid,
          info.lid,
          info.name,
          info.phone,
          info.phoneBR,
          there_is,
          linkStr,
        ],
      });
    }

    console.log(
      `WPP Custom: Saved contact ${info.phone || info.wid} to database.`
    );
    return true;
  } catch (error) {
    console.error(`WPP Custom: Error saving contact:`, error);
    return false;
  }
}
