# Elysia with Bun runtime

## Getting Started
To get started with this template, simply paste this command into your terminal:
```bash
bun create elysia ./elysia-example
```

## Development
To start the development server run:
```bash
bun run dev
```

Open http://localhost:3000/ with your browser to see the result.

## WhatsApp (Evolution GO)

Configure `EVOLUTION_GO_URL`, `EVOLUTION_GO_API_KEY` e `EVOLUTION_INSTANCE_NAME`. O serviço envia texto para `POST /message/sendText/{instância}` com o número em formato E.164, sem `+`.

## Mercado Pago

Crie uma aplicação no Mercado Pago e configure:

```env
APP_URL=https://app.estudeai.com
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=...
MERCADOPAGO_NOTIFICATION_URL=https://api.estudeai.com/billing/webhooks/mercadopago
MERCADOPAGO_PRO_PRICE_CENTS=5990
```

O checkout cria uma assinatura mensal pendente e envia o estudante para o Mercado Pago escolher o meio de pagamento. Configure essa URL para os tópicos `subscription_preapproval` e `subscription_authorized_payment`; ela deve apontar diretamente para a API, não para o proxy do frontend.

## Editais enviados pelos usuários

Os PDFs enviados no onboarding são armazenados no Cloudflare R2 usando a API compatível com S3. Configure:

```env
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET=estudeai-notices
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

O banco guarda apenas o vínculo do edital com o concurso, o nome do arquivo, o status e a chave privada no bucket.

## Docker

```bash
docker build -t estudeai-api .
docker run --rm -p 3333:3333 --env-file .env estudeai-api
```

Execute `bun run db:migrate` como etapa de release antes de subir a imagem.
Configure também um Redis compatível com BullMQ:

```env
REDIS_URL=rediss://usuario:senha@host:6379
```

O `docker-compose.yml` inclui um Redis local persistente. Em produção, use Redis gerenciado e `rediss://` quando o provedor exigir TLS. O Redis funciona como message broker; o Neon guarda apenas o estado, histórico e resultados dos jobs.

Suba processos separados com `bun run worker:plans`, `bun run worker:materials`, `bun run worker:simulations` e `bun run worker:rag`. Eles consomem filas BullMQ e não fazem polling contínuo no Neon.
Os workers usam logs compactos e coloridos no terminal com `LOG_PRETTY=true`. Em produção, prefira `LOG_PRETTY=false` para emitir JSON estruturado; use `LOG_LEVEL=debug` para mais detalhe.

## RAG de questões

As questões extraídas em `data/ingestion/` entram no PostgreSQL com `pgvector`. A indexação é idempotente pelo hash do conteúdo e só inclui as questões candidatas — mantenha a revisão de qualidade antes de usar a base para gerar conteúdo.

```bash
bun run db:migrate
bun run worker:rag
bun run rag:check
```

```env
GEMINI_API_KEY=...
GEMINI_GENERATION_MODEL=gemini-3.6-flash
```

O worker usa `gemini-embedding-2` para vetores e o padrão de geração é `gemini-3.6-flash` (`GEMINI_GENERATION_MODEL`). Ambos usam a chave do tier gratuito do Gemini. O worker aguarda o `retryDelay` devolvido pela API ao atingir a cota e retoma sem duplicar vetores. O `docker-compose.yml` já usa uma imagem do PostgreSQL com `pgvector`. Em stage/produção, o banco também precisa permitir `CREATE EXTENSION vector`; a indexação pode ser executada uma vez a partir da máquina que contém `data/ingestion/`, pois os vetores ficam persistidos no banco.

Com um access token, valide a recuperação antes de gerar aulas:

```bash
curl -H "Authorization: Bearer $ACCESS_TOKEN" "http://localhost:3333/rag/questions/search?q=direito+penal"
```

## Materiais de estudo

Uma tarefa solicita o material, e `worker:materials` recupera questões do RAG, gera a aula com Gemini Flash e envia o aviso no WhatsApp quando concluir.

```bash
bun run worker:materials
curl -X POST -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:3333/study-tasks/TASK_ID/material
curl -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:3333/study-tasks/TASK_ID/material
```

## Coleta de conteúdo público

Os coletores aceitam apenas PDFs HTTPS de domínios oficiais de FGV, INEP, Cebraspe, Vunesp, FCC, IBFC, AOCP, Consulplan, IADES, Idecan e Cesgranrio. Eles preservam a URL de origem, data de coleta e hash; as questões são apenas candidatas extraídas por numeração e devem passar por revisão antes de entrar no RAG.

```bash
# Coleta somente provas recentes e completas, com limite de 12 cadernos por banca.
bun run collect

# Inclui também as fontes históricas, quando for necessário ampliar o acervo legado.
bun run collect:legacy

# Descobre PDFs em uma página oficial de concurso/cartilha.
bun run collect:discover fgv https://conhecimento.fgv.br/concursos/alero25
bun run collect:discover inep https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/outros-documentos
bun run collect:discover cebraspe https://cdn.cebraspe.org.br/concursos/pc_go_16/
bun run collect:discover vunesp https://www.vunesp.com.br/VUNE2403
bun run collect:discover ibfc https://concursos.ibfc.org.br/informacoes/319/

# Baixa e extrai um PDF já aprovado da listagem.
bun run collect:pdf fgv exam 2025-10-12 https://conhecimento.fgv.br/sites/default/files/concursos/arquivo.pdf
bun run collect:pdf inep essay-booklet 2022-01-01 https://download.inep.gov.br/arquivo.pdf

bun run collect:check
```

Os arquivos ficam em `data/ingestion/` (ignorado pelo Git). A data passada no comando é obrigatoriamente anterior a hoje; ela é declarada pelo operador, então a página oficial ainda precisa ser conferida. Use somente provas já realizadas e materiais cuja forma de uso permita indexação; uma página pública não equivale automaticamente a uma licença de republicação.
## Catálogo de matérias por edital

Para atualizar os conteúdos programáticos de concursos conhecidos, execute:

```bash
bun run collect:notices
```

O coletor percorre as páginas oficiais cadastradas, encontra PDFs de edital, extrai as disciplinas com Gemini e atualiza o catálogo global. Na geração do plano, essas matérias são unidas às matérias escolhidas pelo aluno.
