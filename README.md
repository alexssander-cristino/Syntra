# Syntra — chatbot com IA local

Projeto inicial funcional com:
- Web: React + Vite
- API: Node.js + Express
- IA local: Ollama
- Banco: PostgreSQL
- Autenticação: JWT + senha com hash bcrypt
- App Android: Flutter (cliente da mesma API)

> Este é um MVP de desenvolvimento. Antes de disponibilizar publicamente, configure HTTPS, CORS restrito, backups, monitoramento, política de privacidade, recuperação de senha e revisão de segurança.

## Requisitos
- Windows 10/11
- Node.js 20 ou superior
- Git (opcional)
- PostgreSQL 15 ou superior
- Ollama para Windows
- Flutter SDK (somente para o app Android)

## 1. Instale o Ollama e baixe um modelo
Instale: https://ollama.com/download/windows

No PowerShell:
```powershell
ollama pull qwen3:4b
ollama list
```
Teste:
```powershell
ollama run qwen3:4b
```
Digite `/bye` para sair. Se o computador tiver pouca RAM, escolha um modelo menor disponível na biblioteca do Ollama.

## 2. Crie o banco PostgreSQL
Instale PostgreSQL: https://www.postgresql.org/download/windows/
No pgAdmin ou no `psql`, crie o banco:
```sql
CREATE DATABASE syntra;
```
Execute o arquivo `backend/sql/schema.sql` nesse banco. Com `psql`, por exemplo:
```powershell
psql -U postgres -d syntra -f .\backend\sql\schema.sql
```

## 3. Configure e rode a API
Em um PowerShell:
```powershell
cd .\backend
Copy-Item .env.example .env
notepad .env
```
Preencha `DATABASE_URL` e troque `JWT_SECRET` por um segredo longo e aleatório. Exemplo de URL local:
`postgres://postgres:SUA_SENHA@localhost:5432/syntra`

Instale e execute:
```powershell
npm install
npm run dev
```
A API fica em `http://localhost:3000`. Verifique em `http://localhost:3000/health`.

O Ollama deve estar executando no computador, normalmente em `http://127.0.0.1:11434`.

## 4. Rode a interface web
Abra outro PowerShell:
```powershell
cd .\web
Copy-Item .env.example .env
npm install
npm run dev
```
Abra o endereço mostrado pelo Vite, normalmente `http://localhost:5173`.

A variável `VITE_API_URL` deve apontar para a API, sem barra final. O padrão é `http://localhost:3000/api`.

## 5. Rodar no Android com Flutter
Instale Flutter e Android Studio/SDK. Na pasta do projeto:
```powershell
cd .\mobile
flutter pub get
```
Para emulador Android, a API no computador é acessada por `http://10.0.2.2:3000/api`. Isso já é o padrão do app.
Para celular físico, conecte o celular e o PC à mesma rede Wi-Fi, descubra o IP do PC com `ipconfig` e execute:
```powershell
flutter run --dart-define=API_BASE_URL=http://192.168.1.100:3000/api
```
Troque o IP de exemplo pelo IPv4 real do PC. Permita a porta 3000 no firewall apenas na rede privada de desenvolvimento. Para produção, use HTTPS.

## Endpoints principais
- `POST /api/auth/register` — `{ name, email, password }`
- `POST /api/auth/login` — `{ email, password }`
- `GET /api/auth/me` — JWT Bearer
- `GET /api/models` — modelos instalados no Ollama
- `GET /api/conversations` — conversas da conta
- `POST /api/conversations` — `{ title? }`
- `GET /api/conversations/:id/messages`
- `POST /api/chat` — `{ conversationId, message, model }`
- `POST /api/conversations/:id/regenerate` — refaz a última resposta do assistente
- `DELETE /api/conversations/:id` — exclui conversa

## Segurança e limitações
- Senhas armazenadas com bcrypt; tokens JWT; rate limit; validação básica; consultas parametrizadas.
- O `JWT_SECRET` precisa ser substituído antes de qualquer uso.
- `CORS_ORIGIN` deve conter a origem exata da web em produção.
- O MVP faz uma chamada não-streaming ao Ollama; respostas longas podem demorar.
- O endpoint Ollama não deve ser exposto diretamente à internet.
- As rotas não implementam ainda recuperação de senha, verificação de e-mail, MFA, cobrança, moderação avançada ou exclusão/exportação LGPD automatizada.
- A configuração de rede Android em HTTP é somente para desenvolvimento local. Não publique sem HTTPS.
