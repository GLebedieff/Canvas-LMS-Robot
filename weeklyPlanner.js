/**
 * weeklyPlanner.js
 * Planejador semanal autônomo com IA (Groq) — gera roteiro e salva no Notion.
 */

const { notion, ASSIGNMENTS_DB_ID, NOTION_PLANNER_DB_ID } = require('./config');
const axios = require('axios');

const DIAS_SEMANA_MAP = {
    0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta',
    4: 'Quinta', 5: 'Sexta', 6: 'Sábado'
};

function formatarData(date) {
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

function formatarDataISO(date) {
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getInicioSemana(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getFimSemana(date) {
    const inicio = getInicioSemana(date);
    const fim = new Date(inicio);
    fim.setDate(inicio.getDate() + 6);
    return fim;
}

function getHojeBRT() {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

async function buscarTarefasPendentes() {
    console.log('🔍 Buscando tarefas pendentes no Notion...');
    try {
        const res = await notion.databases.query({
            database_id: ASSIGNMENTS_DB_ID,
            filter: {
                property: 'Done',
                checkbox: { equals: false }
            }
        });
        
        const tarefas = res.results.map(page => {
            const nomeProp = Object.keys(page.properties).find(k => page.properties[k].type === 'title');
            const nome = nomeProp ? page.properties[nomeProp]?.title[0]?.plain_text : 'Tarefa sem nome';
            const prazo = page.properties['Deadline']?.date?.start || null;
            return { nome, prazo };
        });
        
        // Filtra as tarefas que tem prazo para essa semana (ou atrasadas)
        const hoje = getHojeBRT();
        const fimSemana = getFimSemana(hoje);
        fimSemana.setHours(23, 59, 59, 999);
        
        const tarefasDaSemana = tarefas.filter(t => {
            if (!t.prazo) return true; // Se não tem prazo, mas tá pendente, inclui
            const dataPrazo = new Date(t.prazo);
            return dataPrazo <= fimSemana;
        });

        if (tarefasDaSemana.length === 0) {
            return "[Nenhuma tarefa pendente adicionada para esta semana.]";
        }

        return tarefasDaSemana.map(t => {
            if (!t.prazo) return `- ${t.nome} - Sem prazo definido`;
            const dataPrazo = new Date(t.prazo);
            const diaSemana = DIAS_SEMANA_MAP[dataPrazo.getDay()];
            return `- ${t.nome} - Prazo: ${diaSemana} ${dataPrazo.getHours().toString().padStart(2, '0')}:${dataPrazo.getMinutes().toString().padStart(2, '0')}`;
        }).join('\n');

    } catch (error) {
        console.error('⚠️ Erro ao buscar tarefas do Notion:', error.message);
        return "[Nenhuma tarefa adicionada devido a um erro de busca.]";
    }
}

async function gerarPlannerComGroq(tarefasTexto) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY não configurada no ambiente.');

    const prompt = `# CONTEXTO E PERSONA
Você é um Especialista em Engenharia de Software, Gestão de Tempo de Alta Performance e Neurociência da Aprendizagem. Seu objetivo é converter meus inputs semanais em um planner semanal de estudo rígido (estilo ITA/IME), porém biologicamente sustentável. Você deve orquestrar minhas aulas, monitorias, tempo de deslocamento e tarefas pendentes em um cronograma impecável.

# INPUTS DA SEMANA
<GRADE_PRESENCIAL>
Segunda: 07:50 - 12:40 Exp. Criativa
Terça: 07:50 - 09:20 PSCF | 09:40 - 12:40 CMSC (Criação de Modelos)
Quarta: 07:50 - 09:20 Filosofia | 09:40 - 11:10 POO | 11:10 - 12:40 PSCF
Quinta: 07:50 - 11:10 Segurança da Informação | 11:10 - 12:40 Monitoria Modelagem
Sexta: 07:50 - 09:20 Filosofia | 09:40 - 12:40 POO
</GRADE_PRESENCIAL>

<HORARIOS_DE_SAIDA>
Segunda: 12:40
Terça: 15:00 (devido à Monitoria BD)
Quarta: 16:00 (devido à Monitoria BD)
Quinta: 12:40
Sexta: 12:40
</HORARIOS_DE_SAIDA>

<HORARIOS_MONITORIA_BD>
Terça: 14:00 - 15:00
Quarta: 14:00 - 16:00
</HORARIOS_MONITORIA_BD>

<TAREFAS_NOTION_CANVAS>
${tarefasTexto}
</TAREFAS_NOTION_CANVAS>

# METAS DE ESTUDO EXTRACLASSE E PRIORIDADES
P1 (MÁXIMA): Experiência Criativa (Meta: 4h/semana)
P2 (ALTA): POO (Meta: 3h a 4h/semana)
P3 (MÉDIA): Seg. da Informação, Criação de Modelos, PSCF (Meta: 2h/semana cada)
P4 (BAIXA): Filosofia (Meta: 1h/semana)

# REGRAS RÍGIDAS (HARD CONSTRAINTS)
A Lei do Dia Oposto: É terminantemente proibido alocar estudo extraclasse de uma matéria no mesmo dia de sua aula presencial.
Exceção: O estudo de POO é permitido durante a Monitoria de BD (mesmo se houver aula de POO no dia).
Monitoria Estratégica: Os horários definidos em <HORARIOS_MONITORIA_BD> devem ser alocados EXCLUSIVAMENTE para POO (30min Flashcards + Restante Coding).
A Regra do Deslocamento e Jantar: O primeiro bloco de estudo em casa DEVE iniciar exatamente no horário de Saída da PUCPR + 2 horas. Este intervalo de 2h é blindado (ônibus + alimentação).
Limite de Saúde Mental (Hard Stop):
Encerramento ABSOLUTO de atividades cognitivas às 21:30. Nenhuma tarefa pode ultrapassar esse horário.
Se o tempo entre a "Chegada em casa" e as "21:30" não permitir 2 blocos completos de 2h, aloque apenas 1 bloco ou reduza o tempo do bloco de forma proporcional. O que sobrar vai para o Domingo.
Intervalo obrigatório de 10 min a cada hora estudada.
Sistema de Gatilho (Notion): As entregas listadas em <TAREFAS_NOTION_CANVAS> têm prioridade. Se houver conflito, o estudo teórico da matéria perde espaço para a execução da tarefa daquela matéria.
Domingo QG (08:00 - 15:00): Exclusivo para: Revisão Global, execução de tarefas que não couberam nos dias da semana devido ao limite das 21:30, e 1 hora de almoço obrigatória (12:00 - 13:00).

# METODOLOGIA DE ESTUDO POR MATÉRIA (MICRO-TAREFAS)
Exp. Criativa: Blocos de 2h (Deep Work 100% Coding/Projeto).
POO: Blocos focados em: 30min Flashcards + Restante Live Coding.
P3 (Média): Blocos divididos em: 20min Flashcards + 70min Resolução Canvas + Restante Cópia Ativa.
Filosofia (P4): 1 único bloco semanal (máx 1h) de leitura dinâmica e tarefas.

# INSTRUÇÕES DE SAÍDA (OUTPUT)
Passo 1: Gere uma tag <RASCUNHO_LOGICO> onde você analisa passo a passo os horários de saída de cada dia, calcula o horário exato de início em casa (Saída + 2h30min) e verifica quantas horas sobram até o Hard Stop das 21:30. Defina aqui quais matérias entram em quais dias baseando-se na Regra do Dia Oposto.
Passo 2: Apresente o "Resumo de Entregas" em bullet points listando em quais dias as tarefas do Notion foram alocadas.
Passo 3: Gere a Tabela Markdown final (otimizada para importação no Notion). Use estritamente as seguintes colunas:
| Dia | Horário Início - Fim | Ambiente | Disciplina | Foco Específico (Canvas/Notion) | Metodologia (Ex: 30m Flashcards + Coding) | Status |
Atenção: A coluna "Ambiente" deve conter apenas "PUCPR" (para aulas/monitorias), "Deslocamento/Descanso" (para as 2h30min pós-saída) ou "Casa" (para o estudo). A coluna "Status" deve ser preenchida com [ ].`;

    console.log('🤖 Enviando prompt para a API do Groq (Llama 3)...');
    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content;
    } catch (e) {
        console.error('❌ Erro na API do Groq:', e.response?.data || e.message);
        throw e;
    }
}

async function dividirEInserirNoNotion(texto, parentId) {
    const LIMITE_CARACTERES = 2000;
    
    // Divide o texto em linhas, garantindo que não quebre blocos no meio desnecessariamente
    const blocos = texto.split('\n\n'); 
    let buffer = '';
    const textBlocks = [];

    for (let bloco of blocos) {
        if (buffer.length + bloco.length > LIMITE_CARACTERES) {
            textBlocks.push(buffer);
            buffer = bloco + '\n\n';
        } else {
            buffer += bloco + '\n\n';
        }
    }
    if (buffer.trim()) textBlocks.push(buffer);

    const children = textBlocks.map(tb => ({
        object: 'block',
        type: 'paragraph',
        paragraph: {
            rich_text: [{ type: 'text', text: { content: tb.trim() } }]
        }
    }));

    // O Notion API permite até 100 children blocks por chamada
    // Como agrupamos por 2000 chars, dificilmente passará de 10 blocos.
    await notion.blocks.children.append({
        block_id: parentId,
        children: children
    });
}

async function enviarAlertaDiscord(titulo) {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
        await axios.post(webhookUrl, {
            content: `🎯 **NOVO PLANNER GERADO** 🎯\n\nO planner semanal da **${titulo}** acabou de ser gerado e salvo no Notion! Confira para planejar seus estudos.`
        });
        console.log(`🚀 Notificação de planner enviada para o Discord.`);
    } catch (err) {
        console.error('❌ Erro ao enviar notificação de planner para o Discord:', err.message);
    }
}

async function executarPlanner() {
    try {
        console.log('\n🗓️ Iniciando Geração do Planejador Semanal via Groq...');
        if (!NOTION_PLANNER_DB_ID) {
            console.log('⚠️ NOTION_PLANNER_DB_ID não configurado. Planner desativado.');
            return;
        }

        const hoje = getHojeBRT();
        const inicio = getInicioSemana(hoje);
        const fim = getFimSemana(hoje);
        const titulo = `Semana ${formatarData(inicio)} - ${formatarData(fim)}`;

        // Verifica se a página desta semana já existe
        const existente = await notion.databases.query({
            database_id: NOTION_PLANNER_DB_ID,
            filter: { property: 'Data Início', date: { equals: formatarDataISO(inicio) } }
        });

        if (existente.results.length > 0) {
            console.log(`📋 O planner da semana ${titulo} já existe no Notion. Para gerar novamente, delete a página ou desative esta verificação.`);
            // Dependendo do fluxo, poderíamos atualizar, mas é mais seguro não sobrescrever.
            // Para permitir geração manual várias vezes, comentaremos o early return ou avisaremos:
            // return;
        }

        // Busca tarefas e gera o conteúdo da IA
        const tarefasTexto = await buscarTarefasPendentes();
        const plannerMarkdown = await gerarPlannerComGroq(tarefasTexto);

        console.log('📝 Criando página no Notion...');
        const novaPagina = await notion.pages.create({
            parent: { database_id: NOTION_PLANNER_DB_ID },
            properties: {
                'Semana': { title: [{ text: { content: titulo + ` (${Date.now()})` } }] }, // Append Date.now() para não sobrepor títulos caso gere mais de uma vez manual
                'Data Início': { date: { start: formatarDataISO(inicio) } },
                'Status': { select: { name: 'Ativa' } }
            }
        });

        await dividirEInserirNoNotion(plannerMarkdown, novaPagina.id);
        
        console.log(`✅ Página do Planner criada no Notion com sucesso!`);
        
        await enviarAlertaDiscord(titulo);

        console.log('\n✅ Planejador Semanal finalizado!');
    } catch (error) {
        console.error('❌ Erro no Planejador Semanal:', error.message);
    }
}

module.exports = { executarPlanner };
