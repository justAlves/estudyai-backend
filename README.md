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
