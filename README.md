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

## Abacate Pay

Crie na Abacate Pay um produto Pro de `R$ 59,90` (`price: 5990`) com ciclo `MONTHLY`, depois configure:

```env
APP_URL=https://app.estudeai.com
ABACATEPAY_API_KEY=...
ABACATEPAY_PRO_PRODUCT_ID=prod_...
ABACATEPAY_WEBHOOK_SECRET=...
```

Cadastre o webhook HTTPS `https://api.estudeai.com/billing/webhooks/abacatepay?webhookSecret=...` para os eventos `subscription.completed`, `subscription.renewed`, `subscription.trial_started` e `subscription.cancelled`.

## Docker

```bash
docker build -t estudeai-api .
docker run --rm -p 3333:3333 --env-file .env estudeai-api
```

Execute `bun run db:migrate` como etapa de release antes de subir a imagem.
Suba um segundo processo com a mesma imagem e comando `bun run worker:plans` para gerar planos em segundo plano.
Os workers escrevem logs JSON no stdout; use `LOG_LEVEL=debug` para mais detalhe.

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
