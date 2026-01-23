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
    // Check if phone matches profiles.phone OR exists in profiles.wa_phones array
    // Note: SQLite JSON logic might depend on Turso extension support, but simple LIKE works for standard JSON text search
    // to check existence in array.

    // We search for the phone inside the JSON array string using LIKE.
    // Format is like ["555...", "555..."], so we can search for "%"phone"%"

    const rs = await client.execute({
      sql: `
        SELECT u.is_active 
        FROM users u 
        JOIN profiles p ON u.id = p.user_id 
        WHERE u.is_active = 1
        AND (
            p.phone = ? 
            OR p.wa_phones LIKE ?
        )
      `,
      args: [phone, `%"${phone}"%`],
    });

    return rs.rows.length > 0;
  } catch (error) {
    console.error('WPP Custom: Auth check failed:', error);
    return false;
  }
}

/**
 * Get internal database User ID from session phone
 */
export async function getDbUser(sessionPhone: any): Promise<string | null> {
  if (!sessionPhone) return null;

  const phoneStr =
    typeof sessionPhone === 'string'
      ? sessionPhone
      : sessionPhone._serialized || sessionPhone.user || '';
  const phone = phoneStr.replace(/\D/g, '');

  try {
    const rs = await client.execute({
      sql: `
        SELECT u.id 
        FROM users u 
        JOIN profiles p ON u.id = p.user_id 
        WHERE u.is_active = 1
        AND (
            p.phone = ? 
            OR p.wa_phones LIKE ?
        )
      `,
      args: [phone, `%"${phone}"%`],
    });

    if (rs.rows.length > 0) {
      return rs.rows[0].id as string;
    }
    return null;
  } catch (error) {
    console.error('WPP Custom: Error getting user ID:', error);
    return null;
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
    // Extra fields from getPnLidEntry
    contact?: {
      name?: string;
      shortName?: string;
      pushname?: string;
      type?: string;
      isBusiness?: boolean;
      isEnterprise?: boolean;
      verifiedName?: string;
      isContactSyncCompleted?: number;
      syncToAddressbook?: boolean;
    };
  };
}) {
  const me = await conn.getMyUserId();
  const userId = await getDbUser(me);

  if (!userId) {
    console.warn(
      'WPP Custom: Unauthorized access to saveContact (User not found)'
    );
    return false;
  }

  try {
    const { there_is, data: info } = data;
    const linkStr = JSON.stringify(info.link);

    // 1. Insert/Update Contacts Table
    // We need the contact ID back.
    // If wid provided, we use it for conflict. If not, we insert.
    // To get the ID, we might need a SELECT after or RETURNING (if supported by libSQL/SQLite)
    // RETURNING id works in modern SQLite.

    let contactId: number | bigint | undefined;

    if (info.wid) {
      // Upsert
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

      // Select ID
      const rsId = await client.execute({
        sql: `SELECT id FROM contacts WHERE wid = ?`,
        args: [info.wid],
      });
      if (rsId.rows.length > 0) {
        // Handle object or array row
        const row = rsId.rows[0];
        // @ts-expect-error row is object or array
        contactId = row.id || row[0];
      }
    } else {
      // Insert
      // For phone-only contacts, checking if it exists first might be needed to avoid unique constraint errors if phone unique? No, phone is not unique in TURSO-DB.md indices (only wid/lid).
      // But we want to avoid duplicates if possible?
      // Doc says "phone: Telefone ... Indices: phone". Not unique.
      // So we just insert.

      const _rs = await client.execute({
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
      // In this case, we need the last inserted ID.
      // SQLite 'last_insert_rowid()' usually works.
      const rsId = await client.execute('SELECT last_insert_rowid() as id');
      if (rsId.rows.length > 0) {
        const row = rsId.rows[0];
        // @ts-expect-error row is object or array
        contactId = row.id || row[0];
      }
    }

    // 2. Insert/Update contacts_users
    if (contactId && info.contact) {
      const c = info.contact;
      await client.execute({
        sql: `INSERT INTO contacts_users (
                contact_id, user_id, 
                name, short_name, pushname, type, 
                is_business, is_enterprise, verified_name,
                is_contact_sync_completed, sync_to_addressbook,
                assigned_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(contact_id, user_id) DO UPDATE SET
                name = excluded.name,
                short_name = excluded.short_name,
                pushname = excluded.pushname,
                type = excluded.type,
                is_business = excluded.is_business,
                is_enterprise = excluded.is_enterprise,
                verified_name = excluded.verified_name,
                is_contact_sync_completed = excluded.is_contact_sync_completed,
                sync_to_addressbook = excluded.sync_to_addressbook,
                assigned_at = CURRENT_TIMESTAMP`,
        args: [
          contactId,
          userId,
          c.name || null,
          c.shortName || null,
          c.pushname || null,
          c.type || null,
          c.isBusiness || null,
          c.isEnterprise || null,
          c.verifiedName || null,
          c.isContactSyncCompleted || null,
          c.syncToAddressbook || null,
        ],
      });
    } else if (contactId) {
      // Even if no extra contact info, create the relation
      await client.execute({
        sql: `INSERT OR IGNORE INTO contacts_users (contact_id, user_id) VALUES (?, ?)`,
        args: [contactId, userId],
      });
    }

    console.log(
      `WPP Custom: Saved contact ${info.phone || info.wid} to database (User: ${userId}).`
    );
    return true;
  } catch (error) {
    console.error(`WPP Custom: Error saving contact:`, error);
    return false;
  }
}
