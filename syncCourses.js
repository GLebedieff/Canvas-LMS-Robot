const { notion, canvas, COURSES_DB_ID } = require('./config');

/**
 * Função principal para sincronizar os cursos do Canvas com o Notion
 * e arquivar matérias passadas.
 */
async function sincronizarCursos() {
    try {
        console.log('\n🚀 Iniciando sincronização de cursos...');

        if (!COURSES_DB_ID) {
            console.log('⚠️ Aviso: COURSES_DB_ID não está configurado. Sincronização de cursos ignorada.');
            return;
        }

        // 1. Buscar o esquema do Banco de Dados no Notion para descobrir o nome e tipos dos campos
        const dbInfo = await notion.databases.retrieve({ database_id: COURSES_DB_ID });
        const schema = dbInfo.properties;

        const titleKey = Object.keys(schema).find(key => schema[key].type === 'title');
        if (!titleKey) {
            console.error('❌ Erro: Não foi encontrada nenhuma coluna do tipo "title" no banco de dados de Cursos do Notion.');
            return;
        }

        // 2. Buscar todas as páginas de cursos já existentes no Notion (com paginação)
        let notionCourses = [];
        let hasMore = true;
        let startCursor = undefined;

        while (hasMore) {
            const queryRes = await notion.databases.query({
                database_id: COURSES_DB_ID,
                start_cursor: startCursor
            });
            notionCourses = notionCourses.concat(queryRes.results);
            hasMore = queryRes.has_more;
            startCursor = queryRes.next_cursor;
        }

        // Mapear páginas existentes no Notion pelo Canvas ID para busca rápida
        const notionCourseMap = new Map(); // canvasId -> notionPage
        
        for (const page of notionCourses) {
            const canvasCourseId = page.properties['Course Code']?.number || 
                                   page.properties['Course Code']?.rich_text?.[0]?.plain_text || 
                                   page.properties['Course Code']?.title?.[0]?.plain_text ||
                                   page.properties['Canvas ID']?.rich_text?.[0]?.plain_text;
            
            if (canvasCourseId) {
                notionCourseMap.set(canvasCourseId.toString().trim(), page);
            }
        }

        // 3. Buscar os cursos do usuário no Canvas (com paginação)
        let canvasCourses = [];
        let canvasPage = 1;
        
        while (true) {
            const res = await canvas.get(`/courses?per_page=100&page=${canvasPage}`);
            const courses = res.data;
            if (!courses || courses.length === 0) break;
            
            canvasCourses = canvasCourses.concat(courses);
            if (courses.length < 100) break;
            canvasPage++;
        }

        // Filtra cursos válidos (Canvas às vezes retorna objetos vazios ou restritos)
        canvasCourses = canvasCourses.filter(c => c && c.id && c.name);

        console.log(`📊 Encontrados ${canvasCourses.length} cursos no Canvas. Sincronizando...`);

        const isConcluded = (course) => {
            return course.concluded || 
                   course.workflow_state === 'completed' || 
                   (course.end_at && new Date(course.end_at) < new Date());
        };

        const canvasCourseIdsSet = new Set();

        // Helper para montar propriedades dinamicamente de acordo com o esquema do Notion
        const buildProperties = (course, concluded) => {
            const props = {};
            
            // Título do Curso
            props[titleKey] = {
                title: [{ text: { content: course.name } }]
            };

            // ID do Canvas
            if (schema['Course Code']) {
                const type = schema['Course Code'].type;
                if (type === 'number') {
                    props['Course Code'] = { number: Number(course.id) };
                } else if (type === 'rich_text') {
                    props['Course Code'] = { rich_text: [{ text: { content: course.id.toString() } }] };
                }
            } else if (schema['Canvas ID']) {
                props['Canvas ID'] = { rich_text: [{ text: { content: course.id.toString() } }] };
            }

            // Propriedade de Status
            const targetStatus = concluded ? 'Arquivado' : 'Ativo';
            if (schema['Status']) {
                const type = schema['Status'].type;
                if (type === 'status') {
                    props['Status'] = { status: { name: targetStatus } };
                } else if (type === 'select') {
                    props['Status'] = { select: { name: targetStatus } };
                }
            } else if (schema['Arquivado']) {
                const type = schema['Arquivado'].type;
                if (type === 'checkbox') {
                    props['Arquivado'] = { checkbox: concluded };
                }
            }

            return props;
        };

        // 4. Processar cada curso do Canvas
        for (const course of canvasCourses) {
            const canvasIdStr = course.id.toString().trim();
            canvasCourseIdsSet.add(canvasIdStr);
            const concluded = isConcluded(course);

            if (notionCourseMap.has(canvasIdStr)) {
                // O curso já existe no Notion. Vamos verificar se precisamos atualizar o Status ou Nome
                const existingPage = notionCourseMap.get(canvasIdStr);
                const currentStatus = existingPage.properties['Status']?.status?.name || 
                                      existingPage.properties['Status']?.select?.name || 
                                      (existingPage.properties['Arquivado']?.checkbox ? 'Arquivado' : 'Ativo');

                const targetStatus = concluded ? 'Arquivado' : 'Ativo';

                if (currentStatus !== targetStatus) {
                    console.log(`🔄 Atualizando status do curso "${course.name}" (${canvasIdStr}) de "${currentStatus}" para "${targetStatus}"`);
                    const updateProps = buildProperties(course, concluded);
                    await notion.pages.update({
                        page_id: existingPage.id,
                        properties: updateProps
                    });
                }
            } else {
                // O curso não existe no Notion, vamos criá-lo
                console.log(`✨ Criando novo curso no Notion: "${course.name}" (${canvasIdStr})`);
                const newProps = buildProperties(course, concluded);
                await notion.pages.create({
                    parent: { database_id: COURSES_DB_ID },
                    properties: newProps
                });
            }
        }

        // 5. Arquivar cursos que estão no Notion mas não estão mais ativos/presentes no Canvas
        for (const [canvasIdStr, existingPage] of notionCourseMap.entries()) {
            if (!canvasCourseIdsSet.has(canvasIdStr)) {
                const currentStatus = existingPage.properties['Status']?.status?.name || 
                                      existingPage.properties['Status']?.select?.name || 
                                      (existingPage.properties['Arquivado']?.checkbox ? 'Arquivado' : 'Ativo');

                if (currentStatus !== 'Arquivado') {
                    console.log(`⚠️ Matéria ID ${canvasIdStr} não foi listada como ativa no Canvas. Arquivando no Notion...`);
                    
                    const archiveProps = {};
                    if (schema['Status']) {
                        const type = schema['Status'].type;
                        if (type === 'status') {
                            archiveProps['Status'] = { status: { name: 'Arquivado' } };
                        } else if (type === 'select') {
                            archiveProps['Status'] = { select: { name: 'Arquivado' } };
                        }
                    } else if (schema['Arquivado']) {
                        if (schema['Arquivado'].type === 'checkbox') {
                            archiveProps['Arquivado'] = { checkbox: true };
                        }
                    }

                    if (Object.keys(archiveProps).length > 0) {
                        await notion.pages.update({
                            page_id: existingPage.id,
                            properties: archiveProps
                        });
                    }
                }
            }
        }

        console.log('✅ Sincronização de cursos finalizada com sucesso!');
    } catch (error) {
        console.error('❌ Erro na sincronização de cursos:', error.response?.data || error.message);
    }
}

module.exports = { sincronizarCursos };
