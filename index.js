require('dotenv').config();
const axios = require('axios');
const { Client } = require('@notionhq/client');

// Configurações das APIs
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const canvas = axios.create({
    baseURL: 'https://pucpr.instructure.com/api/v1', // URL da PUCPR
    headers: { Authorization: `Bearer ${process.env.CANVAS_TOKEN}` }
});

// IDs dos seus Bancos de Dados no Notion
const COURSES_DB_ID = '62c1660340a283ca8d5b0163355d4df4'; 
const ASSIGNMENTS_DB_ID = process.env.NOTION_ASSIGNMENTS_DB_ID;

async function sincronizar() {
    try {
        console.log('🚀 Iniciando sincronização...');

        // 1. Pegar cursos do Notion que têm ID do Canvas
        const coursesRes = await notion.databases.query({ database_id: COURSES_DB_ID });
        
        for (const coursePage of coursesRes.results) {
            // Ajuste o nome 'ID' abaixo para o nome exato da coluna de ID na sua tabela Courses
            const canvasCourseId = coursePage.properties['Course Code']?.number || coursePage.properties['Course Code']?.rich_text?.[0]?.plain_text || coursePage.properties['Course Code']?.title?.[0]?.plain_text;
            const notionCoursePageId = coursePage.id;
            const titleColumn = Object.keys(coursePage.properties).find(key => coursePage.properties[key].type === 'title');
            const courseName = titleColumn ? coursePage.properties[titleColumn]?.title[0]?.plain_text : 'Matéria Sem Nome';

            if (!canvasCourseId) continue;

            console.log(`\n📚 Verificando: ${courseName} (ID: ${canvasCourseId})`);

            // 2. Buscar tarefas no Canvas para este curso
            const canvasRes = await canvas.get(`/courses/${canvasCourseId}/assignments?include[]=submission`);
            const assignments = canvasRes.data;

            const hoje = new Date();

            for (const task of assignments) {
                if (new Date(task.due_at) < hoje){
                    continue;
                }

                // 3. Verificar se a tarefa já existe no Notion (pelo Canvas ID)
                const existingTask = await notion.databases.query({
                    database_id: ASSIGNMENTS_DB_ID,
                    filter: {
                        property: 'CanvasID ',
                        rich_text: { equals: task.id.toString() }
                    }
                });

                const foiEntregue = task.submission && task.submission.workflow_state !== 'unsubmitted';

                if (existingTask.results.length === 0) {
                    console.log(`✨ Nova tarefa encontrada: ${task.name}`);

                    // 4. Criar a tarefa no Notion vinculando ao curso
                    await notion.pages.create({
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
                            }
                        }
                    });
                } else {
                    const pageIdNotion = existingTask.results[0].id;
                    const jaEstavaConcluidaNoNotion = existingTask.results[0].properties['Concluído']?.checkbox;

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
            }
        }
        console.log('\n✅ Sincronização concluída com sucesso!');
    } catch (error) {
        console.error('❌ Erro na sincronização:', error.response?.data || error.message);
    }
}

sincronizar();