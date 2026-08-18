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
