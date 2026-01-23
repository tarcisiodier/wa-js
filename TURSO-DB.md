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

**Campos específicos da relação contato-usuário:**

- `lid`: LinkedIn ID específico para este usuário (cada usuário pode ter um
  `lid` diferente para o mesmo contato)
- `is_business`: Boolean - se é conta business (pode ser NULL)
- `is_contact_sync_completed`: Boolean - se a sincronização foi completada (1 =
  true)
- `is_enterprise`: Boolean - se é conta enterprise (pode ser NULL)
- `name`: Nome do contato para este usuário (ex: "Ivete Brys")
- `pushname`: Nome de push/display (ex: "Ivete B")
- `short_name`: Nome curto (ex: "Ivete")
- `sync_to_addressbook`: Boolean - se deve sincronizar com agenda
- `type`: Tipo do contato (ex: "in")
- `verified_name`: Nome verificado (pode ser NULL)

**Primary Key:**

- `(contact_id, user_id)` - combinação única

**Índices:**

- `contact_id`
- `user_id`

**Views:**

- `v_contacts_with_users`: Contatos com seus usuários associados (inclui campos
  específicos)
- `v_users_with_contacts`: Usuários com seus contatos associados (inclui campos
  específicos)
- `v_user_contacts_count`: Contagem de contatos por usuário

## 🚀 Uso

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
  name,
  pushname,
  short_name,
  sync_to_addressbook,
  type,
  verified_name
)
SELECT 
  c.id, 
  u.id,
  '142008932913307@lid', -- lid específico para este usuário
  NULL, -- is_business (undefined)
  1,    -- is_contact_sync_completed
  NULL, -- is_enterprise (undefined)
  'Ivete Brys',
  'Ivete B',
  'Ivete',
  1,    -- sync_to_addressbook (true)
  'in',
  NULL  -- verified_name (undefined)
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

**Seeds:**

- `seed_contacts.sql`: Dados de exemplo para contatos
- `seed_users.sql`: Dados de exemplo para users e profiles
- `seed_contacts_users.sql`: Dados de exemplo para relacionamentos
  contatos-usuários

**Migrações:**

- `migrations/001_add_wa_phones.sql`: Adiciona coluna wa_phones em profiles
- `migrations/002_add_contact_user_fields.sql`: Adiciona campos específicos em
  contacts_users
- `migrations/003_add_lid_to_contacts_users.sql`: Adiciona coluna lid em
  contacts_users
- `migrations/004_remove_lid_from_contacts.sql`: Remove coluna lid da tabela
  contacts

**Scripts:**

- `scripts/insert-user.js`: Script Node.js para inserir usuários
- `package.json`: Dependências do projeto
- `.env.example`: Exemplo de arquivo de configuração

**Documentação:**

- `README.md`: Esta documentação
