const { notion, canvas, COURSES_DB_ID, ASSIGNMENTS_DB_ID } = require('./config');
const { enviarTarefaAoDiscord } = require('./discordService');

async function sincronizarTarefas() {
    try {
        console.log('\n🚀 Iniciando sincronização de tarefas...');

        // 1. Pegar cursos do Notion que têm ID do Canvas
        const coursesRes = await notion.databases.query({ database_id: COURSES_DB_ID });
        
        for (const coursePage of coursesRes.results) {
            const canvasCourseId = coursePage.properties['Course Code']?.number || 
                                   coursePage.properties['Course Code']?.rich_text?.[0]?.plain_text || 
                                   coursePage.properties['Course Code']?.title?.[0]?.plain_text;
            
            const notionCoursePageId = coursePage.id;
            const titleColumn = Object.keys(coursePage.properties).find(key => coursePage.properties[key].type === 'title');
            const courseName = titleColumn ? coursePage.properties[titleColumn]?.title[0]?.plain_text : 'Matéria Sem Nome';

            if (!canvasCourseId) continue;

            console.log(`\n📚 Verificando tarefas de: ${courseName} (ID: ${canvasCourseId})`);

            // 2. Buscar tarefas no Canvas para este curso
            let canvasRes;
            try {
                canvasRes = await canvas.get(`/courses/${canvasCourseId}/assignments?include[]=submission`);
            } catch (err) {
                console.log(`⚠️ Não foi possível acessar as tarefas de ${cursoNome} (talvez não haja permissão). Pulando...`);
                continue;
            }
            const assignments = canvasRes.data;

            const hoje = new Date();

            for (const task of assignments) {
                if (new Date(task.due_at) < hoje){
                    continue;
                }

                try {
                    // 3. Verificar se a tarefa já existe no Notion (pelo Canvas ID)
                    const existingTask = await notion.databases.query({
                        database_id: ASSIGNMENTS_DB_ID,
                        filter: {
                            property: 'CanvasID ', // O espaço ao final estava no código original
                            rich_text: { equals: task.id.toString() }
                        }
                    });

                    const foiEntregue = task.submission && task.submission.workflow_state !== 'unsubmitted';

                    if (existingTask.results.length === 0) {
                        console.log(`✨ Nova tarefa encontrada: ${task.name}`);

                        // 4. Criar a tarefa no Notion vinculando ao curso
                        const newNotionPage = await notion.pages.create({
                            parent: { database_id: ASSIGNMENTS_DB_ID },
                            properties: {
                                'Assignment Name': {
                                    title: [{ text: { content: task.name } }]
                                },
                                'CanvasID ': {
                                    rich_text: [{ text: { content: task.id.toString() } }]
                                },
                                'Deadline': task.due_at ? {
                                    date: { start: task.due_at }
                                } : undefined,
                                'Courses': {
                                    relation: [{ id: notionCoursePageId }]
                                },
                                'Done': { 
                                    checkbox: foiEntregue 
                                },
                                'URL': { url: task.html_url }
                            }
                        });
                        const notionPageUrl = newNotionPage.url;
                        await enviarTarefaAoDiscord(task, courseName, canvasCourseId, notionPageUrl);
                    } else {
                        const pageIdNotion = existingTask.results[0].id;
                        
                        // CORREÇÃO DE BUG: O código original verificava 'Concluído', mas ao criar utilizava 'Done'. 
                        // Alterado para buscar a propriedade 'Done'.
                        const jaEstavaConcluidaNoNotion = existingTask.results[0].properties['Done']?.checkbox;

                        // Se foi entregue no Canvas, mas ainda está desmarcada no Notion:
                        if (foiEntregue && !jaEstavaConcluidaNoNotion) {
                            console.log(`✅ Marcando tarefa como concluída no Notion: ${task.name}`);
                            
                            await notion.pages.update({
                                page_id: pageIdNotion,
                                properties: {
                                    'Done': { checkbox: true }
                                }
                            });
                        }
                    }
                } catch (notionErr) {
                    console.log(`⚠️ Falha de conexão ao verificar/salvar a tarefa ${task.name} no Notion: ${notionErr.message}. Tentará novamente na próxima execução.`);
                }
            }
        }
        console.log('\n✅ Sincronização de tarefas concluída com sucesso!');
    } catch (error) {
        console.error('❌ Erro na sincronização de tarefas:', error.response?.data || error.message);
    }
}

module.exports = { sincronizarTarefas };
