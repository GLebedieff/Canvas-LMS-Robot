require('dotenv').config();
const axios = require('axios');

// Puxa as senhas do arquivo .env ou do GitHub Secrets
const CANVAS_TOKEN = process.env.CANVAS_TOKEN;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// A API de avisos do Canvas exige que você passe os códigos das matérias assim:
// Se quiser adicionar mais, é só colocar vírgula (ex: 'course_64033', 'course_62337')
const MATERIAS = ['course_64033', 'course_64035', 'course_64032', 'course_62337', 'course_64098', 'course_64034']; 

const canvas = axios.create({
    baseURL: 'https://pucpr.instructure.com/api/v1',
    headers: { Authorization: `Bearer ${CANVAS_TOKEN}` }
});

async function rodarAlerta() {
    try {
        console.log('📡 Buscando avisos no Canvas...');

        const minutosAtras = 60; 
        const limiteTempo = new Date(Date.now() - minutosAtras * 60 * 1000);

        // 2. Montar a URL de busca do Canvas
        // O Canvas pede os cursos no formato ?context_codes[]=course_123&context_codes[]=course_456
        const queryParams = MATERIAS.map(materia => `context_codes[]=${materia}`).join('&');
        
        const resposta = await canvas.get(`/announcements?${queryParams}`);
        const avisos = resposta.data;

        let avisosEnviados = 0;

        for (const aviso of avisos) {
            const dataPostagem = new Date(aviso.posted_at);

            // 3. Filtrar: O aviso é mais recente que a nossa janela de tempo?
            if (dataPostagem > limiteTempo) {
                console.log(`🚨 Novo aviso detectado: ${aviso.title}`);

                // 4. Disparar para o Discord
                // Enviamos o título e o link, pois o conteúdo (message) vem em HTML puro do Canvas
                const mensagemDiscord = {
                    content: `📢 **NOVO AVISO NO CANVAS** 📢\n\n**Assunto:** ${aviso.title}\n**Link:** ${aviso.html_url}`
                };

                await axios.post(DISCORD_WEBHOOK_URL, mensagemDiscord);
                avisosEnviados++;
            }
        }

        console.log(`✅ Finalizado! ${avisosEnviados} novos avisos enviados para o Discord.`);

    } catch (erro) {
        console.error('❌ Erro:', erro.response?.data || erro.message);
    }
}

rodarAlerta();