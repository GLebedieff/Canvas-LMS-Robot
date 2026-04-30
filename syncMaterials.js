const { notion, canvas, COURSES_DB_ID, NOTION_MATERIAIS_AULA_DB_ID } = require('./config');
const { enviarFicheiroAoDiscord } = require('./discordService');

async function sincronizarMateriais() {
    try {
        console.log('\n🚀 Iniciando sincronização de materiais...');
        
        if (!NOTION_MATERIAIS_AULA_DB_ID) {
            console.log('⚠️ Aviso: NOTION_MATERIALS_DB_ID não está configurado no .env. Sincronização de materiais ignorada.');
            return;
        }

        // 1. Listar os cursos do Notion
        const cursos = await notion.databases.query({ database_id: COURSES_DB_ID });

        for (const curso of cursos.results) {
            // Tenta pegar o ID do canvas de várias formas possíveis (mesma lógica das tarefas)
            const canvasCourseId = curso.properties['Course Code']?.number || 
                                   curso.properties['Course Code']?.rich_text?.[0]?.plain_text || 
                                   curso.properties['Course Code']?.title?.[0]?.plain_text ||
                                   curso.properties['Canvas ID']?.rich_text?.[0]?.plain_text;
            
            const titleColumn = Object.keys(curso.properties).find(key => curso.properties[key].type === 'title');
            const cursoNome = titleColumn ? curso.properties[titleColumn]?.title[0]?.plain_text : 'Matéria Sem Nome';
            const notionCoursePageId = curso.id; 

            if (!canvasCourseId) continue;

            console.log(`\n📚 Buscando materiais para: ${cursoNome} (ID: ${canvasCourseId})`);

            let page = 1;
            let temMais = true;
            let todosFicheiros = [];

            // Limite de tempo de segurança: 24 horas (otimiza a busca mas garante que não vamos perder nada se o bot ficar offline por algumas horas)
            const limiteTempo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            // 1. Buscar pela aba de Arquivos
            try {
                while (temMais) {
                    const res = await canvas.get(`/courses/${canvasCourseId}/files?sort=created_at&order=desc&per_page=100&page=${page}`);
                    const ficheiros = res.data;

                    if (ficheiros.length === 0) {
                        temMais = false;
                        break;
                    }

                    const arquivosRecentes = ficheiros.filter(f => new Date(f.created_at) > limiteTempo);
                    todosFicheiros = todosFicheiros.concat(arquivosRecentes);

                    // Se a quantidade de arquivos recentes for menor que os arquivos retornados,
                    // significa que já encontramos os arquivos antigos, logo podemos parar de buscar!
                    if (arquivosRecentes.length < ficheiros.length || ficheiros.length < 100) {
                        temMais = false;
                    } else {
                        page++;
                    }
                }
            } catch (err) {
                console.log(`⚠️ Aba 'Arquivos' bloqueada ou inacessível em ${cursoNome}.`);
            }
            
            // 2. Sempre buscar através dos 'Módulos' para garantir uma varredura completa
            try {
                console.log(`   🔍 Verificando módulos de ${cursoNome}...`);
                let modulePage = 1;
                let modulesHasMore = true;
                
                while (modulesHasMore) {
                    const modRes = await canvas.get(`/courses/${canvasCourseId}/modules?include[]=items&per_page=100&page=${modulePage}`);
                    const modulos = modRes.data;
                    
                    if (modulos.length === 0) {
                        modulesHasMore = false;
                        break;
                    }
                    
                    // Pegamos File e ExternalUrl dos módulos
                    const relevantItems = modulos.flatMap(m => m.items || []).filter(i => i.type === 'File' || i.type === 'ExternalUrl');
                    
                    for (const item of relevantItems) {
                        if (item.type === 'File') {
                            try {
                                const fileDetailRes = await canvas.get(item.url.replace('https://pucpr.instructure.com/api/v1', ''));
                                const fileData = fileDetailRes.data;
                                // Só adiciona se for um material novo e não estiver já na lista
                                if (new Date(fileData.created_at) > limiteTempo && !todosFicheiros.some(f => f.id === fileData.id)) {
                                    todosFicheiros.push(fileData);
                                }
                            } catch (fileErr) {
                                // ignora erro de arquivo individual
                            }
                        } else if (item.type === 'ExternalUrl') {
                            // Para links externos, não temos created_at facilmente, 
                            // então adicionamos um pseudo-arquivo se não existir na lista
                            const pseudoFile = {
                                id: `ext_${item.id}`,
                                display_name: item.title,
                                url: item.external_url,
                                created_at: new Date().toISOString(), // Assumimos agora, o Notion verifica se já existe
                                is_external: true
                            };
                            if (!todosFicheiros.some(f => f.id === pseudoFile.id)) {
                                todosFicheiros.push(pseudoFile);
                            }
                        }
                    }
                    
                    if (modulos.length < 100) {
                        modulesHasMore = false;
                    } else {
                        modulePage++;
                    }
                }
            } catch (fallbackErr) {
                console.log(`❌ Falha ao buscar módulos de ${cursoNome}.`);
            }

            for (const ficheiro of todosFicheiros) {
                try {
                    // 3. Verificar se já existe no Notion
                    const existingFile = await notion.databases.query({
                        database_id: NOTION_MATERIAIS_AULA_DB_ID,
                        filter: {
                            property: 'Canvas ID',
                            rich_text: { equals: ficheiro.id.toString() } 
                        }
                    });

                    if (existingFile.results.length === 0) {
                        console.log(`🆕 Novo material detectado: ${ficheiro.display_name}`);

                        // 4. Cria no Notion e manda para o Discord
                        await notion.pages.create({
                            parent: { database_id: NOTION_MATERIAIS_AULA_DB_ID },
                            properties: {
                                'Nome': { title: [{ text: { content: ficheiro.display_name } }] },
                                'Canvas ID': { rich_text: [{ text: { content: ficheiro.id.toString() } }] },
                                'Link Canvas': { url: ficheiro.url },
                                'Matéria': { relation: [{ id: notionCoursePageId }] },
                                'Data de Upload': { date: { start: ficheiro.created_at } }
                            }
                        });

                        await enviarFicheiroAoDiscord(ficheiro, cursoNome, canvasCourseId);
                    } else {
                        console.log(`⏭️ Arquivo ${ficheiro.display_name} já está no Notion. Pulando...`);
                    }
                } catch (notionErr) {
                    console.log(`⚠️ Falha de conexão ao verificar/salvar o arquivo ${ficheiro.display_name} no Notion: ${notionErr.message}. Tentará novamente na próxima execução.`);
                }
            }
        }
        console.log('\n✅ Sincronização de materiais concluída!');
    } catch (error) {
        console.error('❌ Erro na sincronização de materiais:', error.response?.data || error.message);
    }
}

module.exports = { sincronizarMateriais };
