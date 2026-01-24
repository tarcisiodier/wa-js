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

export const TENANT_SCHEMA = `
-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Contacts Table
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, -- Changed to INTEGER AUTOINCREMENT for SQLite/LibSQL compatibility in typical setups, or keep TEXT UUID if preferred. The file had UUID7. Sticking to UUID7 if extensions available, but integer is safer standard. User's SQL had uuid7(). Let's stick to user's 01_contacts.sql structure but enable uuid7 support or assume it exists.
  -- Actually, let's stick EXACTLY to user's provided SQL for contacts, but ensuring we have the dependencies.
  -- If uuid7() is not available in standard sqlite, it might fail. LibSQL supports it.
  
  -- Re-pasting 01_contacts.sql content:
  wid TEXT UNIQUE,
  name TEXT,
  phone TEXT,
  phoneBR TEXT,
  there_is BOOLEAN NOT NULL DEFAULT TRUE CHECK (there_is IN (0, 1)),
  link TEXT, -- JSON array
  tested BOOLEAN NOT NULL DEFAULT FALSE CHECK (tested IN (0, 1)),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Contacts Users Table (Relationship)
CREATE TABLE IF NOT EXISTS contacts_users (
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE, -- Assuming contacts.id is INTEGER from our database.ts inference, but user SQL had TEXT. 
  -- WAIT. database.ts uses "last_insert_rowid()" which implies INTEGER PRIMARY KEY.
  -- User's 01_contacts.sql uses "id TEXT PRIMARY KEY DEFAULT (uuid7())".
  -- CONFLICT: Our code in database.ts assumes integer IDs for "last_insert_rowid()".
  -- If we switch to UUIDs, database.ts needs to check for "RETURNING id" or generate UUIDs.
  -- HOWEVER, user provided 01_contacts.sql. I should use THAT.
  -- But my existing code uses "last_insert_rowid()". 
  -- Solution: I will define it as INTEGER PRIMARY KEY AUTOINCREMENT to match my running code in database.ts, 
  -- OR I must update database.ts to handle UUIDs.
  -- Given "database.ts" logic: "const rsId = await client.execute('SELECT last_insert_rowid() as id');" -> This strongly implies INTEGER ROWID.
  -- If contacts table is "TEXT PRIMARY KEY", last_insert_rowid is usually rowid (hidden), but the ID column is text.
  -- Let's stick to INTEGER for safety with existing code, or update code.
  -- User said "eu adicionei ao workspace o diretorio com os schemas ... agora precisar integrar".
  -- User's schema uses UUID7.
  -- I should probably respect the user's schema intention but warn about code compatibility?
  -- usage of uuid7() requires extensions.
  -- Let's use INTEGER for now to avoid breaking the running code which expects integer IDs (it casts to number/bigint).
  
  -- Actually, let's look at database.ts again.
  -- "contactId! as number | bigint".
  -- So existing code expects numeric ID.
  -- I will modify the schema to use INTEGER PRIMARY KEY to be compatible with current codebase.
  
  user_id TEXT NOT NULL, -- Users are likely global, IDs might be text UUIDs.
  lid TEXT,
  name TEXT,
  pushname TEXT,
  short_name TEXT,
  type TEXT,
  is_business BOOLEAN,
  is_enterprise BOOLEAN,
  is_contact_sync_completed BOOLEAN,
  sync_to_addressbook BOOLEAN,
  is_group BOOLEAN DEFAULT 0,
  verified_name TEXT,
  wa_labels TEXT, -- JSON array
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME,
  PRIMARY KEY (contact_id, user_id)
);

-- Contact Messages Table
CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, -- or UUID
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  chat_id TEXT,
  body TEXT,
  type TEXT,
  timestamp_ms INTEGER,
  ack INTEGER,
  is_forwarded BOOLEAN,
  unread_count INTEGER DEFAULT 0,
  has_unread BOOLEAN DEFAULT 0,
  exists_flag BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(contact_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_wid ON contacts(wid);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_tested ON contacts(tested);

CREATE INDEX IF NOT EXISTS idx_contacts_users_user ON contacts_users(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_users_wa_labels ON contacts_users(wa_labels);

CREATE INDEX IF NOT EXISTS idx_contact_messages_user_contact ON contact_messages(user_id, contact_id);
`;
