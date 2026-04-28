/**
 * weeklyPlanner.js
 * Planejador semanal autônomo — gera roteiro e distribui to-dos diários no Notion.
 */

const { notion, canvas, COURSES_DB_ID } = require('./config');
const { gerarConteudoEstudo, getTipoAtividade } = require('./studyContentGenerator');

const NOTION_HORARIO_DB_ID = process.env.NOTION_HORARIO_DB_ID;
const NOTION_PLANNER_DB_ID = process.env.NOTION_PLANNER_DB_ID;
const NOTION_TODO_DB_ID = process.env.NOTION_TODO_DB_ID;
const NOTION_ATIVIDADES_DB_ID = process.env.NOTION_ATIVIDADES_DB_ID;

const PLANNER_TAG = '🤖';

const DIAS_SEMANA_MAP = {
    0: 'Domingo', 1: 'Segunda', 2: 'Terça', 3: 'Quarta',
    4: 'Quinta', 5: 'Sexta', 6: 'Sábado'
};

const TODAS_MATERIAS = [
    { nome: 'Experiência Criativa', courseId: '64033' },
    { nome: 'Performance em Sistemas Ciberfísicos', courseId: '64035' },
    { nome: 'Criação de Modelos de Soluções', courseId: '64032' },
    { nome: 'Filosofia', courseId: '62337' },
    { nome: 'Programação Orientada a Objetos', courseId: '64098' },
    { nome: 'Segurança da Informação', courseId: '64034' }
];

const REVISAO_POR_DIA = {
    'Segunda': TODAS_MATERIAS[0], 
    'Terça': TODAS_MATERIAS[1],   
    'Quarta': TODAS_MATERIAS[2],  
    'Quinta': TODAS_MATERIAS[3],  
    'Sexta': TODAS_MATERIAS[4],   
    'Sábado': TODAS_MATERIAS[5],  
    'Domingo': null               
};

// ===================== HELPERS =====================

const delay = ms => new Promise(res => setTimeout(res, ms));

function getHojeBRT() {
    const now = new Date();
    return new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

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

// ===================== NOTION: LER HORÁRIO =====================

async function lerHorarioDoDia(diaSemana) {
    if (!NOTION_HORARIO_DB_ID) return [];
    try {
        const res = await notion.databases.query({
            database_id: NOTION_HORARIO_DB_ID,
            filter: { property: 'Dia', select: { equals: diaSemana } }
        });
        return res.results.map(entry => {
            const props = entry.properties;
            const titleProp = Object.keys(props).find(k => props[k].type === 'title');
            return {
                materia: titleProp ? props[titleProp].title[0]?.plain_text : 'Sem nome',
                inicio: props['Horário Início']?.rich_text?.[0]?.plain_text || '',
                fim: props['Horário Fim']?.rich_text?.[0]?.plain_text || '',
                tipo: props['Tipo']?.select?.name || 'Aula',
                courseId: props['Course ID']?.rich_text?.[0]?.plain_text || ''
            };
        });
    } catch (error) {
        console.log(`⚠️ Erro ao ler horário do Notion: ${error.message}`);
        return [];
    }
}

// ===================== CANVAS: MATERIAIS E TAREFAS =====================

async function buscarMateriaisRecentes(courseId) {
    let arquivos = [];
    const duasSemanasAtras = new Date();
    duasSemanasAtras.setDate(duasSemanasAtras.getDate() - 14);

    try {
        const res = await canvas.get(`/courses/${courseId}/files?sort=created_at&order=desc&per_page=30`);
        if (res.data && res.data.length > 0) {
            // Filtra os arquivos que foram criados nas últimas duas semanas
            const recentes = res.data.filter(f => new Date(f.created_at) >= duasSemanasAtras);
            arquivos = recentes.map(f => f.display_name);
        }
    } catch {
        // silencioso
    }

    if (arquivos.length === 0) {
        try {
            const modRes = await canvas.get(`/courses/${courseId}/modules?include[]=items&per_page=50`);
            const modulos = modRes.data || [];
            
            // Inverte para começar pelo módulo mais recente (final do curso)
            const modulosInvertidos = [...modulos].reverse();
            
            // Como os itens dos módulos não retornam a data de criação na API padrão de lista,
            // pegamos apenas os materiais do ÚLTIMO módulo ativo, que teoricamente são das últimas semanas.
            if (modulosInvertidos.length > 0) {
                const ultimoModulo = modulosInvertidos[0];
                const items = (ultimoModulo.items || []).filter(i => 
                    i.type === 'File' || i.type === 'Page' || i.type === 'ExternalUrl'
                );
                arquivos = items.slice(0, 10).map(i => i.title);
            }
        } catch (err) {}
    }
    return arquivos;
}

async function buscarTarefasVencendoProximosDias(dateAlvo) {
    const dataAlvoInicio = new Date(dateAlvo);
    dataAlvoInicio.setHours(0, 0, 0, 0);

    const dataAlvoFim = new Date(dateAlvo);
    dataAlvoFim.setDate(dataAlvoFim.getDate() + 3);
    dataAlvoFim.setHours(23, 59, 59, 999);

    const tarefasAgendadas = [];
    for (const materia of TODAS_MATERIAS) {
        try {
            const res = await canvas.get(`/courses/${materia.courseId}/assignments?bucket=upcoming`);
            for (const t of res.data) {
                if (!t.due_at || t.has_submitted_submissions) continue;
                const dueDate = new Date(t.due_at);
                if (dueDate >= dataAlvoInicio && dueDate <= dataAlvoFim) {
                    tarefasAgendadas.push({ nome: t.name, materia: materia.nome, vencimento: dueDate, courseId: materia.courseId });
                }
            }
        } catch (e) {}
    }
    return tarefasAgendadas;
}

// ===================== GERAR ATIVIDADE E OBTER LINK =====================

async function obterOuCriarPaginaAtividade(materiaRevisao, dataObj) {
    const dataStrISO = formatarDataISO(dataObj);
    
    // Tentar buscar no BD de Atividades
    if (NOTION_ATIVIDADES_DB_ID) {
        try {
            const res = await notion.databases.query({
                database_id: NOTION_ATIVIDADES_DB_ID,
                filter: {
                    and: [
                        { property: 'Data', date: { equals: dataStrISO } },
                        { property: 'Nome', title: { contains: materiaRevisao.nome } }
                    ]
                }
            });
            if (res.results.length > 0) {
                const tipoStr = res.results[0].properties['Tipo']?.select?.name || 'Atividade';
                return { url: res.results[0].url, isNova: false, tipoStr, conteudoObj: null };
            }
        } catch (e) {
            console.log(`⚠️ Erro ao buscar atividade no DB: ${e.message}`);
        }
    }

    // Se não encontrou, gerar conteúdo via Gemini e criar a página
    const materiais = await buscarMateriaisRecentes(materiaRevisao.courseId);
    const conteudoObj = await gerarConteudoEstudo(materiaRevisao.nome, materiais);
    
    let url = null;
    let tipoStr = conteudoObj.tipo === 'exercicio' ? 'Exercício Prático' : 'Flashcards';

    if (NOTION_ATIVIDADES_DB_ID) {
        const filhos = [];
        
        if (conteudoObj.tipo === 'exercicio' && conteudoObj.exercicio) {
            const ex = conteudoObj.exercicio;
            filhos.push({ object: 'block', type: 'heading_2', heading_2: { rich_text: [{ type: 'text', text: { content: ex.titulo || 'Exercício' } }] } });
            filhos.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: ex.cenario || '' } }] } });
            filhos.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: 'Requisitos' } }] } });
            for (const req of (ex.requisitos || [])) {
                filhos.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: req } }] } });
            }
            filhos.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: 'Passos Sugeridos' } }] } });
            for (const passo of (ex.passos || [])) {
                filhos.push({ object: 'block', type: 'numbered_list_item', numbered_list_item: { rich_text: [{ type: 'text', text: { content: passo } }] } });
            }
        } else {
            const cards = conteudoObj.flashcards || [];
            for (const card of cards) {
                filhos.push({
                    object: 'block', type: 'toggle',
                    toggle: {
                        rich_text: [{ type: 'text', text: { content: `Q: ${card.frente}` } }],
                        children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `R: ${card.verso}` } }] } }]
                    }
                });
            }
        }

        let props = {
            'Nome': { title: [{ text: { content: `Atividade: ${materiaRevisao.nome}` } }] },
            'Tipo': { select: { name: tipoStr } },
            'Data': { date: { start: dataStrISO } }
        };

        // Tenta achar o ID da página da matéria no banco de cursos para fazer a Relation
        try {
            if (COURSES_DB_ID) {
                const resC = await notion.databases.query({
                    database_id: COURSES_DB_ID,
                    filter: { property: 'Course Name', title: { contains: materiaRevisao.nome } }
                });
                if (resC.results.length > 0) {
                    props['Matéria'] = { relation: [{ id: resC.results[0].id }] };
                }
            }
        } catch (e) {
            console.log('⚠️ Erro ao vincular relação da Matéria. Ignorando campo.', e.message);
        }

        try {
            const resCreate = await notion.pages.create({
                parent: { database_id: NOTION_ATIVIDADES_DB_ID },
                properties: props,
                children: filhos
            });
            url = resCreate.url;
            console.log(`✅ Página de atividade criada: ${url}`);
        } catch (e) {
            console.log(`⚠️ Erro ao criar página no DB Atividades: ${e.message}`);
        }
    }

    return { url, isNova: true, tipoStr, conteudoObj };
}

// ===================== GERAR ROTEIRO DO DIA =====================

async function gerarRoteiroDoDia(hoje) {
    const diaSemana = DIAS_SEMANA_MAP[hoje.getDay()];
    const ehFimDeSemana = hoje.getDay() === 0 || hoje.getDay() === 6;

    console.log(`\n📅 Analisando roteiro para: ${diaSemana} (${formatarData(hoje)})`);

    const horarioDoDia = ehFimDeSemana ? [] : await lerHorarioDoDia(diaSemana);
    const aulas = horarioDoDia.filter(h => h.tipo === 'Aula');
    const monitorias = horarioDoDia.filter(h => h.tipo === 'Monitoria');

    const materiaRevisao = REVISAO_POR_DIA[diaSemana];
    let atividadeData = null;
    
    if (materiaRevisao) {
        atividadeData = await obterOuCriarPaginaAtividade(materiaRevisao, hoje);
        atividadeData.materia = materiaRevisao.nome;
    }

    const tarefas = await buscarTarefasVencendoProximosDias(hoje);

    return { diaSemana, aulas, monitorias, atividadeData, ehFimDeSemana, tarefas };
}

// ===================== NOTION: TO-DO (LISTA DE TAREFAS) =====================

async function descobrirPropriedadesToDo() {
    const db = await notion.databases.retrieve({ database_id: NOTION_TODO_DB_ID });
    let titleProp = null, checkboxProp = null, dateProp = null;
    for (const [name, prop] of Object.entries(db.properties)) {
        if (prop.type === 'title') titleProp = name;
        if (prop.type === 'checkbox') checkboxProp = name;
        if (prop.type === 'date') dateProp = name;
    }
    return { titleProp, checkboxProp, dateProp };
}

async function limparTodosDoPlanner() {
    console.log('\n🗑️ Limpando to-dos do planner anterior...');
    const { titleProp } = await descobrirPropriedadesToDo();
    if (!titleProp) return;

    const res = await notion.databases.query({
        database_id: NOTION_TODO_DB_ID,
        filter: { property: titleProp, title: { starts_with: PLANNER_TAG } }
    });

    let removidos = 0;
    for (const page of res.results) {
        try { await notion.pages.update({ page_id: page.id, archived: true }); removidos++; } catch (err) {}
    }
    console.log(`✅ ${removidos} to-dos do planner removidos.`);
}

async function criarToDo(texto, data, url = null) {
    const { titleProp, checkboxProp, dateProp } = await descobrirPropriedadesToDo();
    const properties = {};
    if (titleProp) properties[titleProp] = { title: [{ text: { content: `${PLANNER_TAG} ${texto}` } }] };
    if (checkboxProp) properties[checkboxProp] = { checkbox: false };
    if (dateProp) properties[dateProp] = { date: { start: formatarDataISO(data) } };

    const payload = { parent: { database_id: NOTION_TODO_DB_ID }, properties };
    
    // Se existir URL, adicionamos no corpo (children) do To-Do para acesso rápido
    if (url) {
        payload.children = [{
            object: 'block', type: 'bookmark', bookmark: { url: url }
        }];
    }

    await notion.pages.create(payload);
}

async function distribuirTodosDoDia() {
    const hoje = getHojeBRT();
    const roteiro = await gerarRoteiroDoDia(hoje);

    console.log('\n📝 Criando to-dos do dia na Lista de Tarefas...');

    for (const aula of roteiro.aulas) {
        await criarToDo(`📚 Aula: ${aula.materia} (${aula.inicio}-${aula.fim})`, hoje);
    }
    for (const mon of roteiro.monitorias) {
        await criarToDo(`🎓 Monitoria (${mon.inicio}-${mon.fim})`, hoje);
    }

    if (roteiro.atividadeData) {
        const act = roteiro.atividadeData;
        await criarToDo(`🎯 ${act.tipoStr}: ${act.materia} (2h alocadas)`, hoje, act.url);
    }

    for (const tarefa of roteiro.tarefas) {
        await criarToDo(`✍️ Tarefa: ${tarefa.nome} [${tarefa.materia}] (Vence ${formatarData(tarefa.vencimento)}) (1h alocada)`, hoje);
    }

    console.log(`✅ To-dos do dia criados com sucesso!`);
}

// ===================== NOTION: PLANNER SEMANAL =====================

async function gerarRoteiroSemanal() {
    const hoje = getHojeBRT();
    const inicio = getInicioSemana(hoje);
    const fim = getFimSemana(hoje);
    const titulo = `Semana ${formatarData(inicio)} - ${formatarData(fim)}`;

    console.log(`\n📅 Gerando roteiro semanal: ${titulo}`);

    const existente = await notion.databases.query({
        database_id: NOTION_PLANNER_DB_ID,
        filter: { property: 'Data Início', date: { equals: formatarDataISO(inicio) } }
    });

    if (existente.results.length > 0) {
        console.log('📋 Roteiro desta semana já existe. Pulando geração.');
        return;
    }

    const blocosDias = [];

    for (let i = 0; i < 7; i++) {
        const dia = new Date(inicio);
        dia.setDate(inicio.getDate() + i);
        const roteiro = await gerarRoteiroDoDia(dia);
        const filhos = [];

        if (roteiro.aulas.length > 0) {
            filhos.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: '📚 Aulas do Dia' } }] } });
            for (const a of roteiro.aulas) {
                filhos.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `${a.inicio}-${a.fim} — ${a.materia}` } }] } });
            }
        }
        if (roteiro.monitorias.length > 0) {
            for (const m of roteiro.monitorias) {
                filhos.push({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ type: 'text', text: { content: `🎓 Monitoria ${m.inicio}-${m.fim}` } }] } });
            }
        }
        if (roteiro.tarefas.length > 0) {
            filhos.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: `✍️ Trabalhar nas Tarefas` } }] } });
            for (const t of roteiro.tarefas) {
                filhos.push({ object: 'block', type: 'to_do', to_do: { rich_text: [{ type: 'text', text: { content: `${t.nome} [Vence em ${formatarData(t.vencimento)}]` } }] } });
            }
        }
        if (roteiro.atividadeData) {
            const act = roteiro.atividadeData;
            
            filhos.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: `📖 Passos de Estudo` } }] } });
            filhos.push({ object: 'block', type: 'to_do', to_do: { rich_text: [{ type: 'text', text: { content: `Revisar os conteúdos de ${act.materia}` } }] } });
            filhos.push({ object: 'block', type: 'to_do', to_do: { rich_text: [{ type: 'text', text: { content: `Fazer anotações sobre o conteúdo estudado` } }] } });

            filhos.push({ object: 'block', type: 'heading_3', heading_3: { rich_text: [{ type: 'text', text: { content: `🎯 Atividade do Dia` } }] } });
            if (act.url) {
                filhos.push({ object: 'block', type: 'bookmark', bookmark: { url: act.url } });
            } else {
                filhos.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `(Falha ao linkar página de ${act.materia})` } }] } });
            }
        }
        if (filhos.length === 0) {
            filhos.push({ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: 'Dia livre — descanse e recarregue! 🌟' } }] } });
        }

        blocosDias.push({
            object: 'block', type: 'heading_2',
            heading_2: { rich_text: [{ type: 'text', text: { content: `📋 ${roteiro.diaSemana} (${formatarData(dia)})` } }], is_toggleable: true, children: filhos }
        });
        if (i < 6) blocosDias.push({ object: 'block', type: 'divider', divider: {} });
        
        // Atraso de 10 segundos entre a geração de cada dia para preservar a cota do Gemini
        if (i < 6) {
            console.log('⏳ Pausa de 10 segundos para preservar os limites de requisição da IA...');
            await delay(10000);
        }
    }

    await notion.pages.create({
        parent: { database_id: NOTION_PLANNER_DB_ID },
        properties: {
            'Semana': { title: [{ text: { content: titulo } }] },
            'Data Início': { date: { start: formatarDataISO(inicio) } },
            'Status': { select: { name: 'Ativa' } }
        },
        children: blocosDias
    });
    console.log(`✅ Roteiro semanal criado: ${titulo}`);
}

async function executarPlanner() {
    try {
        console.log('\n🗓️ Iniciando Planejador Semanal...');
        if (!NOTION_TODO_DB_ID) {
            console.log('⚠️ NOTION_TODO_DB_ID não configurado. Planner desativado.');
            return;
        }

        const hoje = getHojeBRT();
        const diaSemana = hoje.getDay();

        if (diaSemana === 1 && NOTION_PLANNER_DB_ID) await gerarRoteiroSemanal();

        await limparTodosDoPlanner();
        await distribuirTodosDoDia();
        console.log('\n✅ Planejador Semanal finalizado!');
    } catch (error) {
        console.error('❌ Erro no Planejador Semanal:', error.message);
    }
}

module.exports = { executarPlanner };
