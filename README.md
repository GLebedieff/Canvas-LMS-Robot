# 🤖 Canvas LMS & Notion Automation Robot

Este é um projeto completo de automação projetado para conectar o **Canvas LMS** da faculdade (PUCPR) com o ecossistema de produtividade do **Notion**. Utilizando Node.js e integrações de Inteligência Artificial via **Groq (Llama 3)**, este robô retira o peso do planejamento manual de estudos, extraindo materiais da universidade, organizando prazos e gerando desafios e revisões diárias de forma totalmente autônoma.

## 🚀 Funcionalidades Principais

### 1. Sincronização Inteligente (Canvas ↔ Notion)
* **Materiais e Módulos:** O robô varre seus cursos no Canvas, identifica os últimos PDFs, arquivos e páginas de aulas postados nas últimas duas semanas e os envia automaticamente para o seu banco de dados de Materiais do Notion.
* **Tarefas e Prazos (Assignments):** Lê todas as tarefas pendentes do Canvas e sincroniza diretamente com seu painel de estudos, garantindo que nada passe do prazo.

### 2. Planejador Semanal Autônomo (O "Coração" do Robô)
Toda segunda-feira de manhã, o robô constrói o seu **Roteiro de Estudos da Semana** em uma página dedicada do Notion, distribuindo as revisões das matérias igualmente de segunda a sábado. 
* **Atividades Inteligentes via IA (Groq + Llama 3.3):**
  A Inteligência Artificial (100% gratuita via Groq) lê seus últimos PDFs de aulas do Canvas e gera automaticamente Atividades Diárias isoladas e linkadas no seu Planner.
  * **Para Matérias Lógicas/Práticas** *(Ex: POO, Experiência Criativa, Criação de Modelos):* A IA escolhe criar aleatoriamente um mini-desafio **CRUD de terminal** (sem HTML) ou uma **Página Estática** para testar suas habilidades técnicas.
  * **Para Matérias Teóricas** *(Ex: Filosofia, Segurança da Informação, Performance):* A IA gera rigorosamente um pack de **30 Flashcards** profundos de revisão conceitual para estudo ativo.
* **Alertas Antecipados:** O robô caça as tarefas do Canvas que vão vencer nos próximos 3 dias e já "adianta" e aloca essas tarefas no seu roteiro diário atual.

### 3. Gestão de "To-Do" Diária
* Todos os dias (ex: às 06:00 BRT via GitHub Actions), o robô varre sua **Lista de Tarefas** do Notion, limpa os checklists gerados pela IA no dia anterior e distribui os itens do dia de hoje com **tempo de execução alocado** (ex: `🤖 🎯 Exercício Prático: POO (2h alocadas)`).
* Tarefas criadas manualmente por você ficam intocadas, o robô só manipula o que ele mesmo criou usando a flag de identificação `🤖`.

---

## 🛠️ Stack Tecnológica e Integrações

* **Node.js** com `axios` para consumo rápido de endpoints REST.
* **[Notion SDK (`@notionhq/client`)](https://developers.notion.com/)**: Gerenciamento direto das páginas, Relações (Relations) e blocos.
* **[Groq API](https://groq.com/)**: Motor de Inferência hiper-veloz usando o modelo **Llama 3.3 70B Versatile** da Meta, escolhido por ser poderoso e não exigir cartão de crédito (Free Tier ilimitado).
* **[Canvas API](https://canvas.instructure.com/doc/api/index.html)**: Extração de Módulos, Arquivos e Assignments da plataforma universitária.
* **Discord Webhooks**: Notificações silenciosas opcionais em canais dedicados para relatar o log das execuções.
* **GitHub Actions**: Orquestração via CI/CD (`.github/workflows`) automatizando o robô para rodar diariamente sem necessidade de manter servidores locais ativos.

---

## ⚙️ Variáveis de Ambiente Necessárias (`.env`)

Para rodar este projeto na sua máquina ou em seu repositório remoto, você precisará preencher as seguintes chaves de acesso e IDs de bancos de dados no arquivo `.env`:

```env
# Tokens de Autenticação
CANVAS_TOKEN=sua_chave_do_canvas_aqui
NOTION_TOKEN=secret_sua_integration_do_notion
GROQ_API_KEY=gsk_sua_chave_groq_aqui

# Databases Base
COURSES_DB_ID=id_banco_cursos
NOTION_ASSIGNMENTS_DB_ID=id_banco_tarefas
NOTION_MATERIAIS_AULA_DB_ID=id_banco_materiais

# Estrutura do Planner Semanal
NOTION_HORARIO_DB_ID=id_banco_horarios
NOTION_PLANNER_DB_ID=id_banco_planner
NOTION_TODO_DB_ID=id_lista_tarefas
NOTION_ATIVIDADES_DB_ID=id_banco_novas_atividades

# Discord Webhooks (Opcional)
DISCORD_REPOSITORIO_...=https://discord.com/api/webhooks/...
```

## 💻 Como Rodar e Testar

1. Clone o repositório.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Preencha seu arquivo `.env` baseando-se no modelo acima.
4. Execute o roteiro principal:
   ```bash
   node index.js
   ```

*(Nota: Certifique-se de que a sua Integration do Notion está conectada nas opções "Connections" (Conexões) de TODOS os bancos de dados que o código manipula).*
