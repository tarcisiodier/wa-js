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

import * as conn from '../conn';

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

/**
 * Verifica se o usuário atual (baseado no telefone da sessão) está autenticado e ativo no banco
 * @param sessionPhone telefone do usuário atual (ex: 555199...) ou null para pegar automático (não implementado aqui, deve ser passado)
 */
export async function isAuthenticatedUser(sessionPhone: any): Promise<boolean> {
  if (!sessionPhone) return false;

  // Normaliza o telefone: Se vier com @c.us, remove. Se vier com 55..., mantem.
  const phoneStr =
    typeof sessionPhone === 'string'
      ? sessionPhone
      : sessionPhone._serialized || sessionPhone.user || '';
  const phone = phoneStr.replace(/\D/g, '');

  // Na verdade, profiles.phone pode estar salvo de várias formas.
  // O ideal é buscar exato ou com LIKE. Vamos assumir formato numérico simples '555199...'

  try {
    const rs = await client.execute({
      sql: `
        SELECT u.is_active 
        FROM users u 
        JOIN profiles p ON u.id = p.user_id 
        WHERE p.phone = ? AND u.is_active = 1
      `,
      args: [phone],
    });

    return rs.rows.length > 0;
  } catch (error) {
    console.error('WPP Custom: Auth check failed:', error);
    return false;
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
  const me = await conn.getMyUserId();
  if (!(await isAuthenticatedUser(me))) {
    console.warn('WPP Custom: Unauthorized access to saveContact');
    return false;
  }

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
