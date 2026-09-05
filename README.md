# EstudeAI API

API e workers do EstudeAI, construídos com Bun, Elysia, PostgreSQL/Drizzle, Redis/BullMQ e Gemini.

## Rodar localmente

Na raiz do monorepo:

```bash
cp estudyai-backend/.env.example estudyai-backend/.env
# edite DATABASE_URL e JWT_SECRET; GEMINI_API_KEY habilita os recursos de IA
bun install
bun run db:migrate
bun run infra:up
bun run dev:backend
```

A API fica em `http://localhost:3333` e a documentação Swagger em `http://localhost:3333/swagger`.

Para subir somente a API:

```bash
bun run --cwd=estudyai-backend dev
```

Para subir os workers separadamente:

```bash
bun run --cwd=estudyai-backend worker:plans
bun run --cwd=estudyai-backend worker:materials
bun run --cwd=estudyai-backend worker:simulations
bun run --cwd=estudyai-backend worker:essays
```

O worker de RAG é executado sob demanda:

```bash
bun run --cwd=estudyai-backend worker:rag
```

## Banco e infraestrutura

```bash
bun run db:generate  # depois de alterar src/database
bun run db:migrate   # aplica migrations pendentes
bun run db:studio
bun run infra:up     # Redis local via Docker Compose
bun run infra:down
```

O banco deve ser PostgreSQL e precisa suportar `pgvector` quando o RAG for utilizado. O Redis é usado como broker das filas; o estado dos jobs permanece no PostgreSQL.

## Variáveis de ambiente

Copie `.env.example` para `.env`. `DATABASE_URL` e `JWT_SECRET` são obrigatórias. `REDIS_URL` pode apontar para Redis local ou gerenciado. `GEMINI_API_KEY`, Stripe, WhatsApp e R2 habilitam as integrações correspondentes.

Nunca commite o arquivo `.env`.

## Testes

```bash
bun run test
bun run test:e2e  # requer E2E_DATABASE_URL apontando para banco descartável
```

Testes específicos:

```bash
bun run study:check
bun run study:adaptive:check
bun run rag:search:check
bun run collect:check
```

## Principais módulos

- Auth e onboarding
- Billing com Stripe e limites por plano
- Planos, materiais, simulados e adaptação de estudos
- RAG de questões e editais
- Redações: sugestão de tema, upload/texto, correção assíncrona e histórico
- Integração WhatsApp para notificações
