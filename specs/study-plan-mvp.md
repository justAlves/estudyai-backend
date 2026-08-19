# Plano de estudos — MVP

## Regras fechadas

- Um usuário possui um plano ativo por vez; pode editar preferências, que entram na próxima reconstrução.
- Onboarding define concurso/prova, data, banca, horas diárias e matérias prioritárias.
- O plano inicial cobre quatro semanas, estuda de segunda a sexta e alterna estudo, questões e revisão.
- Matérias do onboarding começam primeiro. O RAG poderá ampliar o escopo para matérias relevantes do concurso na versão adaptativa.
- A tarefa só pode ser concluída ou não concluída; tarefas não concluídas serão reagendadas no futuro.
- O plano gratuito é fixo. O Pro terá reconstrução semanal e adaptação por desempenho.
- O overall é percentual, definido por tarefa e complementado futuramente por questões, simulados e redações com pesos fixos.
- Simulados: gratuito até 2/mês; Pro até 8/mês. A implementação fica posterior ao fluxo de tarefas e materiais.

## Fluxo implementado

1. O onboarding cria o concurso, matérias e um job de plano.
2. `worker:plans` cria as tarefas iniciais e avisa pelo WhatsApp.
3. O usuário solicita o material de uma tarefa.
4. `worker:materials` busca contexto no RAG, gera uma aula em Markdown com Gemini 3.6 Flash e persiste as fontes oficiais.
5. A interface consulta o estado `IDLE`, `QUEUED`, `PROCESSING`, `COMPLETED` ou `FAILED` até exibir o material.

## Próximo recorte

Exibir tarefas e material na dashboard; depois registrar conclusão/reagendamento antes de construir plano adaptativo, simulados e redações.
