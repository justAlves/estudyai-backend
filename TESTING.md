# Testes

## Unitários

```bash
bun run test
```

Essa suíte não deve chamar AbacatePay, WhatsApp, Gemini nem alterar o banco. Ela cobre validações, autenticação de requisições, regras de assinatura, adaptação/agendamento e workers puros.

As cotas atualmente contratadas também estão cobertas por testes puros: gratuito tem 2 simulados e 1 redação por mês; Pro tem 20 simulados e 8 redações. A aplicação dessas cotas nos endpoints de simulados/redações será feita quando esses módulos forem implementados.

Para concursos fora do catálogo, a geração tenta primeiro o edital exato e pode usar um edital relacionado da mesma família/cargo como contexto de fallback. As matérias escolhidas no onboarding continuam sempre incluídas no plano.

O upload E2E exige as quatro variáveis `R2_*` configuradas. Sem elas, a API responde de forma controlada informando que o recebimento está temporariamente indisponível.

## E2E da API

O E2E de auth + onboarding usa `app.handle` e um banco PostgreSQL dedicado. O teste é ignorado quando `E2E_DATABASE_URL` não está definido.

```bash
E2E_DATABASE_URL='postgresql://.../estudeai_test' bun run test:e2e
```

Use um banco descartável já migrado. Nunca aponte essa variável para produção ou para o banco de desenvolvimento com dados importantes: o fluxo cria uma conta e um concurso.
