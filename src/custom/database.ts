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
        // Removed lid from contacts table
        sql: `INSERT INTO contacts (wid, name, phone, phoneBR, there_is, link, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(wid) DO UPDATE SET
                  name = excluded.name,
                  phone = excluded.phone,
                  phoneBR = excluded.phoneBR,
                  there_is = excluded.there_is,
                  link = excluded.link,
                  updated_at = CURRENT_TIMESTAMP`,
        args: [
          info.wid,
          // info.lid removed
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
        const row = rsId.rows[0];
        // @ts-expect-error row is object or array
        contactId = row.id || row[0];
      }
    } else {
      // 1. Check if we already have this LID associated with this User
      if (info.lid) {
        try {
          const rsExist = await client.execute({
            sql: `SELECT contact_id FROM contacts_users WHERE user_id = ? AND lid = ?`,
            args: [userId, info.lid],
          });
          if (rsExist.rows.length > 0) {
            const row = rsExist.rows[0];
            // @ts-expect-error row is object or array
            contactId = row.contact_id || row[0];

            console.log(
              `WPP Custom: Found existing contact_id ${contactId} for LID ${info.lid}`
            );

            // Update the existing contact record (even if it has NULL wid) to keep name/phone fresh
            await client.execute({
              sql: `UPDATE contacts SET 
                          name = ?, phone = ?, phoneBR = ?, there_is = ?, link = ?, updated_at = CURRENT_TIMESTAMP
                          WHERE id = ?`,
              args: [
                info.name || null,
                info.phone || null,
                info.phoneBR || null,
                there_is,
                linkStr,
                contactId! as number | bigint, // We know it exists from the check above, but safely casting or using non-null assertion
              ],
            });
          }
        } catch (err) {
          console.error('WPP Custom: Error checking existing LID:', err);
        }
      }

      // 2. If not found, insert new
      if (!contactId) {
        const _rs = await client.execute({
          // Removed lid from contacts table
          sql: `INSERT INTO contacts (wid, name, phone, phoneBR, there_is, link, updated_at)
                      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          args: [
            info.wid,
            // info.lid removed
            info.name,
            info.phone,
            info.phoneBR,
            there_is,
            linkStr,
          ],
        });
        const rsId = await client.execute('SELECT last_insert_rowid() as id');
        if (rsId.rows.length > 0) {
          const row = rsId.rows[0];
          // @ts-expect-error row is object or array
          contactId = row.id || row[0];
        }
      }
    }

    // 2. Insert/Update contacts_users
    if (contactId && info.contact) {
      const c = info.contact;

      const args = [
        contactId,
        userId,
        info.lid || null, // Added lid here
        c.name || null,
        c.shortName || null,
        c.pushname || null,
        c.type || null,
        c.isBusiness || null,
        c.isEnterprise || null,
        c.verifiedName || null,
        c.isContactSyncCompleted || null,
        c.syncToAddressbook || null,
      ];

      console.log(
        'WPP Custom: Debug - Saving to contacts_users. Contact object:',
        JSON.stringify(c)
      );
      console.log('WPP Custom: Debug - SQL Args:', JSON.stringify(args));

      await client.execute({
        sql: `INSERT INTO contacts_users (
                contact_id, user_id, lid,
                name, short_name, pushname, type, 
                is_business, is_enterprise, verified_name,
                is_contact_sync_completed, sync_to_addressbook,
                assigned_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
              ON CONFLICT(contact_id, user_id) DO UPDATE SET
                lid = excluded.lid,
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
        args: args,
      });
    } else if (contactId) {
      // Even if no extra contact info, create the relation

      await client.execute({
        sql: `INSERT INTO contacts_users (contact_id, user_id, lid) 
              VALUES (?, ?, ?)
              ON CONFLICT(contact_id, user_id) DO UPDATE SET
              lid = excluded.lid`,
        args: [contactId, userId, info.lid || null],
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

/**
 * Check if contact exists in database by link
 */
export async function getContactByLink(contactId: string) {
  const me = await conn.getMyUserId();
  const userId = await getDbUser(me);

  if (!userId) return null;

  try {
    // Sanitize contactId for LIKE query
    const search = `%"${contactId}"%`;

    const rs = await client.execute({
      sql: `
        SELECT c.*, 
               cu.lid, cu.name as custom_name, cu.short_name, cu.pushname, 
               cu.verified_name, cu.is_business, cu.is_enterprise,
               cu.is_contact_sync_completed, cu.sync_to_addressbook
        FROM contacts c
        LEFT JOIN contacts_users cu ON c.id = cu.contact_id AND cu.user_id = ?
        WHERE c.link LIKE ?
        LIMIT 1
      `,
      args: [userId, search],
    });

    if (rs.rows.length > 0) {
      const row = rs.rows[0];
      const linkStr = (row.link as string) || '[]';
      let link: string[] = [];
      try {
        link = JSON.parse(linkStr);
      } catch (_e) {
        link = [];
      }

      console.log(`WPP Custom: Found contact in cache: ${contactId}`);

      return {
        there_is: true,
        data: {
          wid: (row.wid as string) || null,
          lid: (row.lid as string) || null,
          name: (row.custom_name as string) || (row.name as string) || null,
          phone: (row.phone as string) || null,
          phoneBR: (row.phoneBR as string) || null,
          there_is: true,
          link: link,
          contact: {
            name:
              (row.custom_name as string) || (row.name as string) || undefined,
            shortName: (row.short_name as string) || undefined,
            pushname: (row.pushname as string) || undefined,
            verifiedName: (row.verified_name as string) || undefined,
            isBusiness: !!row.is_business,
            isEnterprise: !!row.is_enterprise,
            isContactSyncCompleted:
              (row.is_contact_sync_completed as number) || undefined,
            syncToAddressbook: !!row.sync_to_addressbook,
          },
        },
      };
    }

    return null;
  } catch (error) {
    console.error('WPP Custom: Error getting contact by link:', error);
    return null;
  }
}

/**
 * Save contact message (last message)
 */
export async function saveContactMessage(
  contactIdStr: string,
  messageData: {
    message_id: string;
    chat_id: string;
    body: string;
    type: string;
    timestamp_ms: number;
    ack: number;
    is_forwarded: boolean;
    unread_count: number;
    has_unread: boolean;
    exists_flag: boolean;
  }
) {
  const me = await conn.getMyUserId();
  const userId = await getDbUser(me);

  if (!userId) return false;

  try {
    // 1. Get Contact ID
    const rsC = await client.execute({
      sql: `SELECT id FROM contacts WHERE wid = ? LIMIT 1`,
      args: [contactIdStr],
    });

    let contactId: any = null;
    if (rsC.rows.length > 0) {
      contactId = rsC.rows[0].id;
    } else {
      console.warn(
        `WPP Custom: Contact not found for message save: ${contactIdStr}`
      );
      return false;
    }

    // 2. Upsert Message
    await client.execute({
      sql: `INSERT INTO contact_messages (
              contact_id, user_id, message_id, chat_id, body, type,
              timestamp_ms, ack, is_forwarded, unread_count, has_unread, exists_flag,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(contact_id, user_id) DO UPDATE SET
              message_id = excluded.message_id,
              chat_id = excluded.chat_id,
              body = excluded.body,
              type = excluded.type,
              timestamp_ms = excluded.timestamp_ms,
              ack = excluded.ack,
              is_forwarded = excluded.is_forwarded,
              unread_count = excluded.unread_count,
              has_unread = excluded.has_unread,
              exists_flag = excluded.exists_flag,
              updated_at = CURRENT_TIMESTAMP`,
      args: [
        contactId,
        userId,
        messageData.message_id,
        messageData.chat_id,
        messageData.type === 'document' ? null : messageData.body,
        messageData.type,
        messageData.timestamp_ms,
        messageData.ack,
        messageData.is_forwarded ? 1 : 0,
        messageData.unread_count,
        messageData.has_unread ? 1 : 0,
        messageData.exists_flag ? 1 : 0,
      ],
    });

    return true;
  } catch (error) {
    console.error('WPP Custom: Error saving contact message:', error);
    return false;
  }
}

/**
 * Save full contact structure from getAllContacts
 */
export async function saveFullContact(contactData: any) {
  try {
    // 1. Save Contact & User Relation
    const contactInfo = {
      ...contactData.contact,
      contact: contactData.contact_user, // contact_user goes into 'contact' property
    };

    const saved = await saveContact({
      there_is: contactData.contact.there_is,
      data: contactInfo,
    });

    if (!saved) return false;

    // 2. Save Last Message if exists
    if (contactData.lastMessage) {
      const wid = contactData.contact.wid;
      if (wid) {
        await saveContactMessage(wid, contactData.lastMessage);
      }
    }

    return true;
  } catch (error) {
    console.error('WPP Custom: Error saving full contact:', error);
    return false;
  }
}

/**
 * Save multiple contacts using batch execution
 */
export async function saveContactsBatch(contacts: any[]) {
  const me = await conn.getMyUserId();
  const userId = await getDbUser(me);

  if (!userId) {
    console.warn(
      'WPP Custom: Unauthorized access to saveContactsBatch (User not found)'
    );
    return { success: false, saved: 0, failed: contacts.length };
  }

  // Batch size limit (LibSQL/Turso might have limits on statements or size)
  // Safe bet: 20 contacts per batch (~60 statements)
  const BATCH_SIZE = 20;
  let savedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const chunk = contacts.slice(i, i + BATCH_SIZE);
    const statements: any[] = [];

    for (const contactData of chunk) {
      const info = contactData.contact;
      // Normalizing data as in saveContact logic
      const linkStr = JSON.stringify(info.link || []);
      const there_is = info.there_is;
      const wid = info.wid;
      const lid = contactData.contact_user?.lid || info.lid; // Priority to contact_user lid if available

      if (!wid && !lid) continue; // Skip if absolutely no identifier

      if (wid) {
        statements.push({
          sql: `INSERT INTO contacts (wid, name, phone, phoneBR, there_is, link, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(wid) DO UPDATE SET
                    name = excluded.name,
                    phone = excluded.phone,
                    phoneBR = excluded.phoneBR,
                    there_is = excluded.there_is,
                    link = excluded.link,
                    updated_at = CURRENT_TIMESTAMP`,
          args: [wid, info.name, info.phone, info.phoneBR, there_is, linkStr],
        });

        // 2. Upsert Contacts_Users using Subquery for contact_id
        if (contactData.contact_user) {
          const c = contactData.contact_user;
          statements.push({
            sql: `INSERT INTO contacts_users (
                    contact_id, user_id, lid,
                    name, short_name, pushname, type, 
                    is_business, is_enterprise, verified_name,
                    is_contact_sync_completed, sync_to_addressbook,
                    assigned_at
                  ) VALUES ((SELECT id FROM contacts WHERE wid = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(contact_id, user_id) DO UPDATE SET
                    lid = excluded.lid,
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
              wid, // for subquery
              userId,
              lid || null,
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
        }

        // 3. Upsert Message using Subquery for contact_id
        if (contactData.lastMessage) {
          const m = contactData.lastMessage;
          statements.push({
            sql: `INSERT INTO contact_messages (
                    contact_id, user_id, message_id, chat_id, body, type,
                    timestamp_ms, ack, is_forwarded, unread_count, has_unread, exists_flag,
                    updated_at
                  ) VALUES ((SELECT id FROM contacts WHERE wid = ? LIMIT 1), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(contact_id, user_id) DO UPDATE SET
                    message_id = excluded.message_id,
                    chat_id = excluded.chat_id,
                    body = excluded.body,
                    type = excluded.type,
                    timestamp_ms = excluded.timestamp_ms,
                    ack = excluded.ack,
                    is_forwarded = excluded.is_forwarded,
                    unread_count = excluded.unread_count,
                    has_unread = excluded.has_unread,
                    exists_flag = excluded.exists_flag,
                    updated_at = CURRENT_TIMESTAMP`,
            args: [
              wid, // for subquery
              userId,
              m.message_id,
              m.chat_id,
              m.type === 'document' ? null : m.body,
              m.type,
              m.timestamp_ms,
              m.ack,
              m.is_forwarded ? 1 : 0,
              m.unread_count,
              m.has_unread ? 1 : 0,
              m.exists_flag ? 1 : 0,
            ],
          });
        }
      }
    }

    if (statements.length > 0) {
      try {
        await client.batch(statements, 'write');
        savedCount += chunk.length;
        console.log(`WPP Custom: Batched saved ${chunk.length} contacts.`);
      } catch (err) {
        console.error('WPP Custom: Batch save failed:', err);
        failedCount += chunk.length;
      }
    }
  }

  return { success: true, saved: savedCount, failed: failedCount };
}
