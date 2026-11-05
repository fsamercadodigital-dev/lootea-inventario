# Inventário Lootea

Painel interno para cadastrar perfis e Business Managers da operação Lootea. O registro é feito no próprio painel. Não cria conta na Meta nem no provedor de e-mail, e não lê planilha.

## Rodar localmente

```bash
npm install
npm run setup
npm run dev
```

Abra [http://127.0.0.1:38471](http://127.0.0.1:38471).

`npm run setup` cria, só se ainda não existirem:

- `data/passphrase.txt` — frase para entrar no painel
- `data/data-key` — chave do cofre de senhas

Esses arquivos ficam fora do git. Não envie o conteúdo. Se a chave do cofre for perdida, as senhas já gravadas não podem ser lidas.

## O que o painel faz

- Abas Perfis e BMs, com busca, filtro de status e totais calculados dos registros.
- `+ Novo perfil` e `+ Nova BM`. O perfil aberto depois permite editar os dados e o acesso.
- Status manual: Ativo, Offline, Restrito, Em análise. A mudança é gravada na hora.
- Acesso Meta e acesso de e-mail (Gmail, Outlook, Hotmail ou outro): usuário, senha, 2FA e códigos de recuperação. Ficam ocultos. Revelar pede a frase de acesso de novo.
- Nome vazio aparece como “Perfil” mais o número, com o aviso de dados incompletos.

## Armazenamento

Se `DATABASE_URL` estiver definida, o painel usa Postgres. Sem essa variável, fora da Vercel, usa SQLite em `data/inventory.db` no disco deste processo. Esse arquivo só vale numa máquina que guarda o disco. Na Vercel ele não persiste, e o processo recusa subir sem `DATABASE_URL`.

Variáveis, sem valores neste repositório:

- `DATABASE_URL` — Postgres. Obrigatória na Vercel. Use a URL com pool do provedor, se existir.
- `INVENTORY_PASSPHRASE` — frase de acesso. Na Vercel substitui `data/passphrase.txt`.
- `INVENTORY_DATA_KEY` — chave do cofre, 32 bytes em base64. Não fica no banco. Se mudar, as senhas já salvas não abrem.

As senhas usam AES-256-GCM. Sem chave válida, o acesso fica bloqueado e nada é salvo em texto puro. O inventário começa vazio.

## Testes

```bash
npm test
```

Os testes usam um banco temporário. Não alteram `data/inventory.db`.
