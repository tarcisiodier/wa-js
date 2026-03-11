# 📱 WhatsApp Contacts Database

Banco de dados para armazenar contatos do WhatsApp usando Turso Cloud.

## 🗄 Estrutura

### Tabela: `users`

Armazena informações de usuários do sistema.

**Campos:**

- `id`: ID único do registro (UUID-7, gerado automaticamente)
- `email`: Email do usuário - **UNIQUE, NOT NULL**
- `password_hash`: Hash da senha - **NOT NULL**
- `role`: Papel do usuário ('admin' ou 'user') - **NOT NULL**, default: 'user'
- `is_active`: Boolean indicando se o usuário está ativo - **NOT NULL**,
  default: TRUE
- `created_at`: Data de criação
- `updated_at`: Data de atualização (atualizado automaticamente)

**Índices:**

- `email` (único)
- `role`
- `is_active`

### Tabela: `profiles`

Armazena perfis detalhados dos usuários (relacionamento 1:1 com users).

**Campos:**

- `id`: ID único do registro (UUID-7, gerado automaticamente)
- `user_id`: Referência ao usuário - **UNIQUE, NOT NULL**, FK para `users(id)`
- `token`: Token único do perfil (UUID-4, gerado automaticamente) - **UNIQUE**
- `name`: Nome completo
- `phone`: Telefone
- `document`: Documento (CPF, etc.)
- `wa_phones`: Array JSON com telefones WhatsApp (ex:
  `["555194274915", "555180405053"]`)
- `created_at`: Data de criação
- `updated_at`: Data de atualização (atualizado automaticamente)

**Índices:**

- `user_id` (único)
- `token` (único)

**View:**

- `v_users_full`: View combinando users e profiles com todos os dados (inclui
  `wa_phones`)

**Exemplo de uso do `wa_phones`:**

```sql
-- Buscar perfis com telefones WhatsApp
SELECT name, phone, wa_phones, json_array_length(wa_phones) AS wa_phones_count
FROM profiles 
WHERE wa_phones IS NOT NULL;

-- Buscar por telefone específico no array
SELECT * FROM profiles
WHERE json_extract(wa_phones, '$[0]') = '555194274915'
   OR json_extract(wa_phones, '$[1]') = '555194274915';
```

`WPP.conn.getStreamData` - Get current stream mode and info (connection state)

For the most up-to-date list of available functions, launch the project locally and run this in your browser console:

### Tabela: `contacts`

Armazena informações de contatos do WhatsApp.

**Campos:**

- `id`: ID único do registro (gerado automaticamente)
- `wid`: WhatsApp ID (ex: "555199765256@c.us") - **UNIQUE** (pode ser NULL)
- `name`: Nome do contato
- `phone`: Telefone (ex: "555199765256")
- `phoneBR`: Telefone formato brasileiro (ex: "5551999765256")
- `there_is`: Boolean indicando se o contato existe/é válido
- `link`: Array JSON com links/IDs relacionados
- `created_at`: Data de criação
- `updated_at`: Data de atualização (atualizado automaticamente)

**Nota:** O campo `lid` (LinkedIn ID) foi removido desta tabela e agora está
apenas em `contacts_users`, permitindo que cada usuário tenha seu próprio `lid`
para o mesmo contato.

**Índices:**

- `wid` (único, pode ser NULL)
- `phone`
- `phoneBR`
- `name`

### Tabela: `contacts_users`

Tabela de relacionamento muitos-para-muitos entre contatos e usuários.

- Um contato pode pertencer a vários usuários
- Um usuário pode ter vários contatos
- Um contato pode não pertencer a nenhum usuário
- **Campos específicos da relação**: O mesmo contato pode ter dados diferentes
  para cada usuário

**Campos:**

- `contact_id`: Referência ao contato - **NOT NULL**, FK para `contacts(id)`
- `user_id`: Referência ao usuário - **NOT NULL**, FK para `users(id)`
- `assigned_at`: Data de associação - default: CURRENT_TIMESTAMP

**Timestamps:**

- `created_at`: Data de criação - default: CURRENT_TIMESTAMP
- `updated_at`: Data de atualização - default: CURRENT_TIMESTAMP (atualizado
  automaticamente)
- `deleted_at`: Data de exclusão (soft delete) - NULL = não deletado

**Campos específicos da relação contato-usuário:**

- `lid`: LinkedIn ID específico para este usuário (cada usuário pode ter um
  `lid` diferente para o mesmo contato)
- `is_business`: Boolean - se é conta business (pode ser NULL)
- `is_contact_sync_completed`: Boolean - se a sincronização foi completada (1 =
  true)
- `is_enterprise`: Boolean - se é conta enterprise (pode ser NULL)
- `is_group`: Boolean - se é um grupo
- `name`: Nome do contato para este usuário (ex: "Ivete Brys")
- `pushname`: Nome de push/display (ex: "Ivete B")
- `short_name`: Nome curto (ex: "Ivete")
- `sync_to_addressbook`: Boolean - se deve sincronizar com agenda
- `type`: Tipo do contato (ex: "in")
- `verified_name`: Nome verificado (pode ser NULL)
- `wa_labels`: Array JSON com labels do WhatsApp (ex:
  `[{"label_id": "18", "label_name": "Pessoal", "label_color": "#B6B327"}]`)

**Primary Key:**

- `(contact_id, user_id)` - combinação única

**Índices:**

- `contact_id`
- `user_id`
- `deleted_at` (para queries de soft delete)

**Views:**

- `v_contacts_with_users`: Contatos com seus usuários associados (inclui campos
  específicos, filtra deletados)
- `v_users_with_contacts`: Usuários com seus contatos associados (inclui campos
  específicos, filtra deletados)
- `v_user_contacts_count`: Contagem de contatos por usuário (apenas não
  deletados)
- `v_contacts_users_active`: Apenas registros ativos (deleted_at IS NULL)
- `v_contacts_users_deleted`: Apenas registros deletados (deleted_at IS NOT
  NULL)

### Tabela: `contact_messages`

Armazena a última mensagem trocada entre um contato e um usuário.

- Relacionamento 1:1 com `contacts_users` (uma mensagem por relação
  contato-usuário)
- Atualizada automaticamente quando uma nova mensagem é recebida/enviada

**Campos:**

- `id`: ID único do registro (UUID-7, gerado automaticamente)
- `contact_id`: Referência ao contato - **NOT NULL**, FK para `contacts(id)`
- `user_id`: Referência ao usuário - **NOT NULL**, FK para `users(id)`
- `message_id`: ID da mensagem (ex:
  "true_555180405853@c.us_3EB0C8850947365A5AD25D") - **NOT NULL**
- `chat_id`: ID do chat (ex: "555180405853@c.us")
- `body`: Conteúdo da mensagem
- `type`: Tipo da mensagem (ex: "chat")
- `timestamp_ms`: Timestamp em milissegundos (ex: 1769104412)
- `ack`: Acknowledgment/status de leitura (0-3)
- `is_forwarded`: Boolean - se a mensagem foi encaminhada
- `unread_count`: Contador de mensagens não lidas - default: 0
- `has_unread`: Boolean - se tem mensagens não lidas - default: FALSE
- `exists_flag`: Boolean - se a mensagem existe - default: TRUE
- `created_at`: Data de criação - default: CURRENT_TIMESTAMP
- `updated_at`: Data de atualização - default: CURRENT_TIMESTAMP (atualizado
  automaticamente)

**Constraints:**

- `UNIQUE(contact_id, user_id)` - garante uma única mensagem por relação
  contato-usuário
- Foreign key composta para `contacts_users(contact_id, user_id)`

**Índices:**

- `contact_id, user_id` (composto)
- `chat_id`
- `timestamp_ms`
- `has_unread`

**Views:**

- `v_contact_messages_full`: Mensagens com detalhes do contato e usuário
- `v_user_unread_messages`: Contagem de mensagens não lidas por usuário

## 🚀 Uso

`Object.keys(WPP.group).sort()`

### Events

#### Connection Events

`WPP.on('conn.stream_mode_changed', callback)` - Triggered when the connection mode changes

Stream modes:
- `QR` - QR code is displayed, waiting for scan
- `MAIN` - Main interface is loaded and ready
- `SYNCING` - Syncing messages and data
- `OFFLINE` - Connection is offline
- `CONFLICT` - Login conflict detected
- `PROXYBLOCK` - Blocked by proxy
- `TOS_BLOCK` - Blocked for Terms of Service violation
- `SMB_TOS_BLOCK` - SMB blocked for Terms of Service violation
- `DEPRECATED_VERSION` - WhatsApp version is deprecated

```javascript
WPP.on('conn.stream_mode_changed', (mode) => {
  console.log('Connection mode:', mode);
  if (mode === 'MAIN') {
    console.log('WhatsApp is ready!');
  }
});
```

`WPP.on('conn.stream_info_changed', callback)` - Triggered when the internal connection state changes

Stream info states:
- `OFFLINE` - Connection is offline
- `OPENING` - Opening connection
- `PAIRING` - Pairing with phone
- `SYNCING` - Syncing messages
- `RESUMING` - Resuming connection
- `CONNECTING` - Connecting to server
- `NORMAL` - Normal operation

```javascript
WPP.on('conn.stream_info_changed', (info) => {
  console.log('Connection state:', info);
});
```

#### Chat Events

`WPP.chat.on('chat.new_message')` - Event to dispatch on receive a new message

To see all events, check: [https://wppconnect.io/wa-js/types/ev.EventTypes.html](https://wppconnect.io/wa-js/types/ev.EventTypes.html)

## Development

Steps to run locally:

### Conectar ao banco

```bash
turso db shell whatsapp-contacts
```

### Inserir um usuário

```sql
-- Criar usuário
INSERT INTO users (email, password_hash, role) VALUES
('usuario@example.com', 'hash_da_senha', 'user');

-- Criar perfil para o usuário
INSERT INTO profiles (user_id, name, phone) VALUES
('id_do_usuario', 'Nome do Usuário', '5551999999999');
```

### Consultar usuários

```sql
-- Todos os usuários com perfis (view completa)
SELECT * FROM v_users_full;

-- Usuário por email
SELECT * FROM users WHERE email = 'usuario@example.com';

-- Perfil por user_id
SELECT * FROM profiles WHERE user_id = 'id_do_usuario';
```

### Inserir um contato

```sql
INSERT INTO contacts (wid, name, phone, phoneBR, there_is, link) VALUES
(
  '555199765256@c.us',
  'teste',
  '555199765256',
  '5551999765256',
  1,
  '["555199765256@c.us", "555199765256", "5551999765256"]'
);
```

### Consultar contatos

```sql
-- Todos os contatos
SELECT * FROM contacts;

-- Por WhatsApp ID
SELECT * FROM contacts WHERE wid = '555199765256@c.us';

-- Por telefone
SELECT * FROM contacts WHERE phone = '555199765256' OR phoneBR = '5551999765256';

-- Buscar no array link usando JSON
SELECT * FROM contacts 
WHERE json_array_length(link) > 0
  AND json_extract(link, '$[0]') = '555199765256@c.us';
```

### Atualizar contato

```sql
UPDATE contacts 
SET name = 'Novo Nome', 
    updated_at = CURRENT_TIMESTAMP
WHERE wid = '555199765256@c.us';
```

### Associar contato a usuário

```sql
-- Associar um contato a um usuário (básico)
INSERT INTO contacts_users (contact_id, user_id)
SELECT c.id, u.id
FROM contacts c, users u
WHERE c.wid = '555199765256@c.us'
  AND u.email = 'admin@whatsapp.com';

-- Associar contato com dados específicos do usuário
INSERT INTO contacts_users (
  contact_id, 
  user_id,
  lid,
  is_business,
  is_contact_sync_completed,
  is_enterprise,
  is_group,
  name,
  pushname,
  short_name,
  sync_to_addressbook,
  type,
  verified_name,
  wa_labels
)
SELECT 
  c.id, 
  u.id,
  '142008932913307@lid', -- lid específico para este usuário
  NULL, -- is_business (undefined)
  1,    -- is_contact_sync_completed
  NULL, -- is_enterprise (undefined)
  0,    -- is_group (false)
  'Ivete Brys',
  'Ivete B',
  'Ivete',
  1,    -- sync_to_addressbook (true)
  'in',
  NULL, -- verified_name (undefined)
  '[{"label_id": "18", "label_name": "Pessoal", "label_color": "#B6B327"}]' -- wa_labels
FROM contacts c, users u
WHERE c.wid = '555199765256@c.us'
  AND u.email = 'admin@whatsapp.com';
```

### Consultar contatos de um usuário

```sql
-- Contatos de um usuário específico
SELECT c.* 
FROM contacts c
JOIN contacts_users cu ON c.id = cu.contact_id
JOIN users u ON cu.user_id = u.id
WHERE u.email = 'admin@whatsapp.com';

-- Usando a view
SELECT * FROM v_users_with_contacts 
WHERE user_id = (SELECT id FROM users WHERE email = 'admin@whatsapp.com');
```

### Consultar usuários de um contato

```sql
-- Usuários que têm acesso a um contato
SELECT u.*, p.name AS user_name
FROM users u
JOIN contacts_users cu ON u.id = cu.user_id
JOIN profiles p ON u.id = p.user_id
JOIN contacts c ON cu.contact_id = c.id
WHERE c.wid = '555199765256@c.us';
```

### Contagem de contatos por usuário

```sql
SELECT * FROM v_user_contacts_count;
```

### Soft Delete (Exclusão Lógica)

```sql
-- "Deletar" um contato de um usuário (soft delete)
UPDATE contacts_users 
SET deleted_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
WHERE contact_id = (SELECT id FROM contacts WHERE wid = '555199765256@c.us' LIMIT 1)
  AND user_id = (SELECT id FROM users WHERE email = 'admin@whatsapp.com' LIMIT 1);

-- Restaurar um contato deletado
UPDATE contacts_users 
SET deleted_at = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE contact_id = (SELECT id FROM contacts WHERE wid = '555199765256@c.us' LIMIT 1)
  AND user_id = (SELECT id FROM users WHERE email = 'admin@whatsapp.com' LIMIT 1);

-- Ver apenas contatos ativos (não deletados)
SELECT * FROM v_contacts_users_active;

-- Ver apenas contatos deletados
SELECT * FROM v_contacts_users_deleted;

-- Ver todos os contatos (incluindo deletados)
SELECT * FROM contacts_users;
```

### Gerenciar Última Mensagem

```sql
-- Inserir/Atualizar última mensagem
INSERT INTO contact_messages (
  contact_id, user_id, message_id, chat_id, body, type,
  timestamp_ms, ack, is_forwarded, unread_count, has_unread, exists_flag
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(contact_id, user_id) DO UPDATE SET
  message_id = EXCLUDED.message_id,
  chat_id = EXCLUDED.chat_id,
  body = EXCLUDED.body,
  type = EXCLUDED.type,
  timestamp_ms = EXCLUDED.timestamp_ms,
  ack = EXCLUDED.ack,
  is_forwarded = EXCLUDED.is_forwarded,
  unread_count = EXCLUDED.unread_count,
  has_unread = EXCLUDED.has_unread,
  exists_flag = EXCLUDED.exists_flag,
  updated_at = CURRENT_TIMESTAMP;

-- Consultar última mensagem de um contato
SELECT * FROM contact_messages
WHERE contact_id = (SELECT id FROM contacts WHERE wid = '555180405853@c.us' LIMIT 1)
  AND user_id = (SELECT id FROM users WHERE email = 'tarcisiodier@icloud.com' LIMIT 1);

-- Ver todas as últimas mensagens de um usuário (com detalhes)
SELECT * FROM v_contact_messages_full
WHERE user_email = 'tarcisiodier@icloud.com'
ORDER BY timestamp_ms DESC;

-- Ver mensagens não lidas
SELECT * FROM v_user_unread_messages
WHERE user_id = (SELECT id FROM users WHERE email = 'tarcisiodier@icloud.com' LIMIT 1);

-- Marcar mensagem como lida
UPDATE contact_messages
SET has_unread = FALSE,
    unread_count = 0,
    ack = 3,
    updated_at = CURRENT_TIMESTAMP
WHERE contact_id = ? AND user_id = ?;
```

### Consultar Labels do WhatsApp

```sql
-- Contatos com labels
SELECT 
  cu.name,
  cu.wa_labels,
  json_array_length(cu.wa_labels) AS labels_count
FROM contacts_users cu
WHERE cu.wa_labels IS NOT NULL;

-- Buscar contatos por label específica
SELECT cu.*, c.wid
FROM contacts_users cu
JOIN contacts c ON cu.contact_id = c.id
WHERE cu.wa_labels LIKE '%"label_id": "18"%';

-- Contatos que são grupos
SELECT cu.*, c.wid, c.name
FROM contacts_users cu
JOIN contacts c ON cu.contact_id = c.id
WHERE cu.is_group = 1;
```

## 📝 Formato de Dados

O formato JSON esperado:

```json
{
  "wid": "555199765256@c.us",
  "lid": "142008932913307@lid",
  "name": "teste",
  "phone": "555199765256",
  "phoneBR": "5551999765256",
  "there_is": true,
  "link": [
    "555199765256@c.us",
    "555199765256",
    "142008932913307@lid",
    "5551999765256"
  ]
}
```

## 🔧 Comandos Turso CLI

```bash
# Listar bancos
turso db list

# Mostrar informações do banco
turso db show whatsapp-contacts

# Conectar ao shell
turso db shell whatsapp-contacts

# Criar token de autenticação
turso db tokens create whatsapp-contacts

# Executar arquivo SQL
cat 01_contacts.sql | turso db shell whatsapp-contacts
```

## 🚀 Scripts Node.js

### Inserir Usuário

Script para inserir usuários no banco de dados via Node.js.

**Pré-requisitos:**

```bash
# Instalar dependências
npm install

# Criar arquivo .env com as credenciais
cp .env.example .env
# Editar .env e adicionar o TURSO_AUTH_TOKEN
```

**Executar:**

```bash
npm run insert-user
```

O script `scripts/insert-user.js` está configurado para inserir:

- Nome: Tarcisio Dier
- Email: tarcisiodier@icloud.com
- Senha: Girassol@44# (será hasheada com bcrypt)
- Role: user
- Phone: 5551994274915

**Para inserir outro usuário:** Edite o objeto `userData` no arquivo
`scripts/insert-user.js`.

## 📦 Arquivos

**Schemas:**

- `01_contacts.sql`: Schema da tabela de contatos
- `02_users.sql`: Schema das tabelas users e profiles
- `03_contacts_users.sql`: Schema da tabela de relacionamento contatos-usuários
- `04_contact_messages.sql`: Schema da tabela de últimas mensagens

**Seeds:**

- `seed_contacts.sql`: Dados de exemplo para contatos
- `seed_users.sql`: Dados de exemplo para users e profiles
- `seed_contacts_users.sql`: Dados de exemplo para relacionamentos
  contatos-usuários
- `seed_contact_messages.sql`: Dados de exemplo para últimas mensagens

**Migrações:**

- `migrations/001_add_wa_phones.sql`: Adiciona coluna wa_phones em profiles
- `migrations/002_add_contact_user_fields.sql`: Adiciona campos específicos em
  contacts_users
- `migrations/003_add_lid_to_contacts_users.sql`: Adiciona coluna lid em
  contacts_users
- `migrations/004_remove_lid_from_contacts.sql`: Remove coluna lid da tabela
  contacts
- `migrations/005_add_timestamps_to_contacts_users.sql`: Adiciona created_at,
  updated_at e deleted_at em contacts_users
- `migrations/006_add_is_group_wa_labels.sql`: Adiciona is_group e wa_labels em
  contacts_users

**Scripts:**

- `scripts/insert-user.js`: Script Node.js para inserir usuários
- `package.json`: Dependências do projeto
- `.env.example`: Exemplo de arquivo de configuração

**Documentação:**

- `README.md`: Esta documentação
