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

import * as ConfigChat from '../chat';
import * as conn from '../conn';
import * as contact from '../contact';
import * as ConfigLabels from '../labels';
import { ContactStore } from '../whatsapp';
import { getContactByLink, isAuthenticatedUser } from './database';

/**
 * Busca contatos formatados para inserção no banco de dados
 * Retorna dados compatíveis com tabelas: contacts, contacts_users, contact_messages
 */
export async function getAllContacts(options: any = {}) {
  const {
    includeGroups = false,
    includeUnsaved = false,
    validateServer = false,
    includeLastMessage = true,
    includeLabels = true,
    limit,
  } = options;

  const isReady = await conn.isMainReady();
  if (!isReady) {
    throw new Error('WhatsApp connection not ready');
  }

  /**
   * Formata telefone brasileiro (adiciona 9º dígito se necessário)
   */
  const formatPhoneBR = (phone: string | null) => {
    if (!phone || phone.length < 10) return phone;

    const cleanPhone = phone.replace(/^55/, '');

    if (cleanPhone.length === 10 || cleanPhone.length === 11) {
      const ddd = cleanPhone.substring(0, 2);
      const number = cleanPhone.substring(2);

      if (number.length === 8 && /^[6-9]/.test(number)) {
        return `55${ddd}9${number}`;
      }

      return `55${cleanPhone}`;
    }

    return phone;
  };

  try {
    if (!ContactStore) {
      throw new Error('ContactStore unavailable');
    }

    // Buscar labels
    const labelMap = new Map();
    if (includeLabels) {
      try {
        console.log('[getAllContacts] Fetching labels...');
        const allLabels = await ConfigLabels.getAllLabels();
        allLabels.forEach((label: any) => {
          labelMap.set(label.id, {
            id: label.id,
            name: label.name,
            color: label.hexColor || label.color || null,
          });
        });
        console.log(`[getAllContacts] Found ${labelMap.size} labels`);
      } catch (_err) {
        console.warn('[getAllContacts] Failed to fetch labels:', _err);
      }
    }

    // Mapear chats + última mensagem
    console.log('[getAllContacts] Fetching chats...');
    const chats = await ConfigChat.list();
    const chatMap = new Map();

    for (const chat of chats) {
      const chatId = chat.id?._serialized;
      if (!chatId) continue;

      let lastMsg = null;

      if (includeLastMessage && chat.lastReceivedKey) {
        try {
          const messages = await ConfigChat.getMessages(chatId, { count: 1 });
          if (messages && messages.length > 0) {
            const msg = messages[0];
            lastMsg = {
              message_id: msg.id?._serialized || msg.id,
              chat_id: chatId,
              body: msg.body || '',
              type: msg.type || 'chat',
              timestamp_ms: msg.t || msg.timestamp,
              ack: msg.ack,
              is_forwarded: msg.isForwarded || false,
              unread_count: chat.unreadCount || 0,
              has_unread: (chat.unreadCount || 0) > 0,
              exists_flag: true,
            };
          }
        } catch (_err) {
          console.warn(
            `[getAllContacts] Failed to get last message for ${chatId}`
          );
        }
      }

      chatMap.set(chatId, { hasChat: true, lastMessage: lastMsg });
    }

    const allModels = ContactStore.getModelsArray();
    console.log(`[getAllContacts] Processing ${allModels.length} contacts`);

    const contactMap = new Map();
    const lidMap = new Map();

    /**
     * Processa labels
     */
    const processLabels = (model: any) => {
      if (!includeLabels) return [];
      try {
        const contactLabels = model.labels || [];
        return contactLabels
          .map((labelId: string) => {
            const labelInfo = labelMap.get(labelId);
            return labelInfo
              ? {
                  label_id: labelId,
                  label_name: labelInfo.name,
                  label_color: labelInfo.color,
                }
              : null;
          })
          .filter(Boolean);
      } catch (_err) {
        return [];
      }
    };

    // Fase 1: Classificar e mapear
    for (const model of allModels) {
      const id = model.id?._serialized;
      if (!id || id === '0@c.us' || id === 'status@c.us') continue;

      // Grupos
      if (id.endsWith('@g.us')) {
        if (includeGroups) {
          const chatInfo = chatMap.get(id);
          const number = id.split('@')[0];

          contactMap.set(id, {
            contact: {
              wid: id,
              name: model.name || model.pushname || number,
              phone: number,
              phoneBR: number,
              there_is: true,
              link: [id, number],
            },
            contact_user: {
              lid: null,
              is_business: false,
              is_contact_sync_completed:
                (model as any).isContactSyncCompleted || 0,
              is_enterprise: false,
              name: model.name || model.pushname || number,
              pushname: model.pushname,
              short_name: model.shortName,
              sync_to_addressbook: 0,
              type: 'group',
              verified_name: null,
              is_group: true,
              labels: processLabels(model),
            },
            lastMessage: chatInfo?.lastMessage || null,
          });
        }
        continue;
      }

      // Contatos @c.us
      if (id.endsWith('@c.us')) {
        const hasName = !!model.name;
        const chatInfo = chatMap.get(id);
        const hasChat = chatInfo?.hasChat || false;

        if (!hasName && !includeUnsaved) continue;
        if (!hasName && !hasChat && !includeUnsaved) continue;

        const number = (model.id.user || id.split('@')[0]) as string;
        const phoneBR = formatPhoneBR(number);

        contactMap.set(number, {
          contact: {
            wid: id,
            name: model.name || model.pushname || number,
            phone: number,
            phoneBR: phoneBR,
            there_is: true,
            link: [id, number, phoneBR],
          },
          contact_user: {
            lid: null,
            is_business: model.isBusiness || null,
            is_contact_sync_completed:
              (model as any).isContactSyncCompleted || 0,
            is_enterprise: model.isEnterprise || null,
            name: model.name,
            pushname: model.pushname,
            short_name: model.shortName,
            sync_to_addressbook: (model as any).isAddressBookContact ? 1 : 0,
            type: hasName ? 'in' : 'out',
            verified_name: model.verifiedName,
            is_group: false,
            labels: processLabels(model),
          },
          lastMessage: chatInfo?.lastMessage || null,
          _model: model,
        });
        continue;
      }

      // LIDs
      if (id.endsWith('@lid')) {
        lidMap.set(id, model);
        continue;
      }
    }

    console.log(
      `[getAllContacts] Found ${contactMap.size} contacts, ${lidMap.size} LIDs`
    );

    // Fase 2: Enriquecer com LID
    let enriched = 0;
    for (const [number, data] of contactMap) {
      if (data.contact_user.is_group) continue;

      try {
        const entry = await contact.getPnLidEntry(data.contact.wid);

        if (entry?.lid) {
          const lidSerialized = entry.lid._serialized;
          if (!data.contact.link.includes(lidSerialized)) {
            data.contact.link.push(lidSerialized);
          }

          data.contact_user.lid = lidSerialized;

          if (lidMap.has(lidSerialized)) {
            const lidModel = lidMap.get(lidSerialized);

            // Mesclar labels
            if (includeLabels && lidModel.labels?.length > 0) {
              const lidLabels = processLabels(lidModel);
              const existingIds = new Set(
                data.contact_user.labels.map((l: any) => l.label_id)
              );
              lidLabels.forEach((label: any) => {
                if (!existingIds.has(label.label_id)) {
                  data.contact_user.labels.push(label);
                }
              });
            }

            lidMap.delete(lidSerialized);
          }

          if (entry.contact?.name && !data.contact_user.name) {
            data.contact_user.name = entry.contact.name;
            data.contact.name = entry.contact.name;
          }

          enriched++;
        }

        if (validateServer) {
          try {
            const validation = await contact.queryExists(number);
            data.contact.there_is = validation?.wid !== undefined;
          } catch (_err) {
            data.contact.there_is = false;
          }
        }

        if (enriched % 50 === 0) {
          await new Promise((r) => setTimeout(r, 10));
        }
      } catch (_err) {
        console.warn(
          `[getAllContacts] Enrichment failed for ${data.contact.wid}`
        );
      }
    }

    console.log(`[getAllContacts] Enriched ${enriched} contacts with LID data`);

    // Fase 3: Processar LIDs órfãos
    let promoted = 0;
    for (const [lidId, lidModel] of lidMap) {
      try {
        const entry = await contact.getPnLidEntry(lidId);

        if (entry?.phoneNumber?._serialized) {
          const phoneId = entry.phoneNumber._serialized;
          // @ts-expect-error entry.phoneNumber has user property in runtime
          const number = entry.phoneNumber.user || phoneId.split('@')[0];

          if (!contactMap.has(number)) {
            const hasName = !!(lidModel.name || entry.contact?.name);
            const chatInfo = chatMap.get(phoneId);
            const phoneBR = formatPhoneBR(number);

            contactMap.set(number, {
              contact: {
                wid: phoneId,
                name:
                  entry.contact?.name ||
                  lidModel.name ||
                  lidModel.pushname ||
                  number,
                phone: number,
                phoneBR: phoneBR,
                there_is: true,
                link: [phoneId, number, lidId, phoneBR],
              },
              contact_user: {
                lid: lidId,
                is_business: lidModel.isBusiness || null,
                is_contact_sync_completed:
                  (lidModel as any).isContactSyncCompleted || 0,
                is_enterprise: lidModel.isEnterprise || null,
                name: entry.contact?.name || lidModel.name,
                pushname: lidModel.pushname,
                short_name: lidModel.shortName,
                sync_to_addressbook: hasName ? 1 : 0,
                type: hasName ? 'in' : 'out',
                verified_name: lidModel.verifiedName,
                is_group: false,
                labels: processLabels(lidModel),
              },
              lastMessage: chatInfo?.lastMessage || null,
            });

            promoted++;
          }
        }

        if (promoted % 50 === 0) {
          await new Promise((r) => setTimeout(r, 10));
        }
      } catch (_err) {
        console.warn(`[getAllContacts] LID resolution failed for ${lidId}`);
      }
    }

    console.log(`[getAllContacts] Promoted ${promoted} LIDs to contacts`);

    // Fase 4: Formatar resultado final
    const results = Array.from(contactMap.values()).map((data: any) => {
      delete data._model;
      return data;
    });

    const finalResults = limit ? results.slice(0, limit) : results;

    console.log(`[getAllContacts] Returning ${finalResults.length} contacts`);

    return finalResults;
  } catch (error) {
    console.error('[getAllContacts] Error:', error);
    throw error;
  }
}
export async function checkNumber(contactId: string) {
  const me = await conn.getMyUserId();
  if (!(await isAuthenticatedUser(me))) {
    console.warn('WPP Custom: Unauthorized access to checkNumber');
    return { there_is: false, data: { unauthorized: true } };
  }

  // 1. Check Cache first
  const cached = await getContactByLink(contactId);
  if (cached) {
    return cached;
  }

  const result = await contact.queryExists(contactId);

  if (result) {
    let wid = result.wid._serialized || result.wid || null;
    const lid = result.lid?._serialized || result.lid || null;
    const name = (result as any).name || null;
    let phone = result.wid.user || null;
    let phoneBR =
      phone && phone.length === 12 && phone.startsWith('55')
        ? phone.slice(0, 4) + '9' + phone.slice(4)
        : phone;

    // Use the canonical WID or LID found by queryExists
    let extraInfo: any = { contact: undefined };
    if (wid) {
      extraInfo = await contact.getPnLidEntry(wid);
    } else if (lid) {
      extraInfo = await contact.getPnLidEntry(lid);
    }

    // If we didn't have a WID but PnLidEntry found one (e.g. via LID lookup), use it
    if (!wid && extraInfo.phoneNumber) {
      wid = extraInfo.phoneNumber._serialized;
      phone = extraInfo.phoneNumber.id;
      phoneBR =
        phone && phone.length === 12 && phone.startsWith('55')
          ? phone.slice(0, 4) + '9' + phone.slice(4)
          : phone;
    }

    // Fallback: If we have LID but no WID/Phone, use the input contactId
    if (!wid && lid && !phone) {
      // User provided contactId might be formatted. Sanitize or use raw?
      // contactId usually comes as 555199...@c.us or numbers.
      const number = contactId.replace(/@.*/, '');
      phone = number;
      phoneBR =
        phone && phone.length === 12 && phone.startsWith('55')
          ? phone.slice(0, 4) + '9' + phone.slice(4)
          : phone;
    }

    return {
      there_is: true,
      data: {
        wid,
        lid,
        name,
        phone,
        phoneBR,
        there_is: true,
        link: [wid, phone, phoneBR].filter((item) => item !== null),
        contact: extraInfo.contact,
      },
    };
  } else {
    const number = contactId.replace(/@.*/, '');
    let phone = number;
    let phoneBR = number;

    if (number.startsWith('55')) {
      if (number.length === 13) {
        phone = number.slice(0, 4) + number.slice(5);
      }
      if (number.length === 12) {
        phoneBR = number.slice(0, 4) + '9' + number.slice(4);
      }
    }

    return {
      there_is: false,
      data: {
        wid: null,
        lid: null,
        name: null,
        phone,
        phoneBR,
        there_is: false,
        link: [null, phone, null, phoneBR].filter((item) => item !== null),
      },
    };
  }
}

/**
 * Sync all contacts to database
 */
export async function syncAllContacts(options?: any) {
  const me = await conn.getMyUserId();
  if (!(await isAuthenticatedUser(me))) {
    console.warn('WPP Custom: Unauthorized access to syncAllContacts');
    return { success: false, error: 'Unauthorized' };
  }

  try {
    console.log('WPP Custom: Starting contact sync...');
    const contacts = await getAllContacts(options);
    console.log(`WPP Custom: Fetched ${contacts.length} contacts. Saving...`);

    let savedCount = 0;
    let failedCount = 0;

    // Save in batches or one by one? One by one is safer for SQLite concurrency in basic setup.
    // Database logic handles transactions/locking internally usually.
    // Parallelizing might lock the DB. Sequential is safer.

    for (const contact of contacts) {
      // Import saveFullContact dynamically or at top?
      // Since it's in the same bundle, better import at top.
      const { saveFullContact } = await import('./database');
      const result = await saveFullContact(contact);
      if (result) savedCount++;
      else failedCount++;

      if ((savedCount + failedCount) % 50 === 0) {
        console.log(
          `WPP Custom: Sync Progress: ${savedCount + failedCount}/${
            contacts.length
          }`
        );
        // Small delay to yield to UI/Main thread
        await new Promise((r) => setTimeout(r, 10));
      }
    }

    console.log(
      `WPP Custom: Sync complete. Saved: ${savedCount}, Failed: ${failedCount}`
    );
    return {
      success: true,
      total: contacts.length,
      saved: savedCount,
      failed: failedCount,
    };
  } catch (error) {
    console.error('WPP Custom: Error syncing contacts:', error);
    return { success: false, error: error };
  }
}
