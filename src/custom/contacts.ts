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

import * as conn from '../conn';
import * as contact from '../contact';
import { isAuthenticatedUser } from './database';

/**
 * Verifica se um número existe no WhatsApp e retorna seus dados
 */
export async function checkNumber(contactId: string) {
  const me = await conn.getMyUserId();
  if (!(await isAuthenticatedUser(me))) {
    console.warn('WPP Custom: Unauthorized access to checkNumber');
    return { there_is: false, data: { unauthorized: true } };
  }

  const result = await contact.queryExists(contactId);

  if (result) {
    const wid = result.wid._serialized || result.wid || null;
    const lid = result.lid?._serialized || result.lid || null;
    const name = (result as any).name || null;
    const phone = result.wid.user || null;
    const phoneBR =
      phone && phone.length === 12 && phone.startsWith('55')
        ? phone.slice(0, 4) + '9' + phone.slice(4)
        : phone;

    const extraInfo = await contact.getPnLidEntry(contactId);

    return {
      there_is: true,
      data: {
        wid,
        lid,
        name,
        phone,
        phoneBR,
        there_is: true,
        link: [wid, phone, lid, phoneBR].filter((item) => item !== null),
        contact: extraInfo,
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
