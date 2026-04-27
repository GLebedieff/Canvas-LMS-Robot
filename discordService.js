const axios = require('axios');
const { WEBHOOKS_ATIVIDADES, WEBHOOKS_MATERIAIS } = require('./config');

async function enviarTarefaAoDiscord(task, courseName, courseId, notionPageUrl) {
    // Busca a URL específica para essa matéria
    const webhookUrl = WEBHOOKS_ATIVIDADES[courseId.toString()];

    if (!webhookUrl) {
        console.log(`⚠️ Aviso: Sem canal de Discord configurado para a matéria ID ${courseId}`);
        return;
    }

    const dataFormatada = task.due_at 
        ? new Date(task.due_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) 
        : 'Sem prazo fixado';

    const payload = {
        content: `📝 **NOVA ATIVIDADE DETECTADA** 📝\n\n` +
                `**Matéria:** ${courseName}\n` +
                `**Tarefa:** ${task.name}\n` +
                `**Prazo de Entrega:** ${dataFormatada}\n` +
                `**Link do Canvas:** ${task.html_url}\n` +
                `**Link do Notion:** ${notionPageUrl}`
    };

    try {
        await axios.post(webhookUrl, payload);
        console.log(`🚀 Notificação enviada para o canal de ${courseName}`);
    } catch (err) {
        console.error(`❌ Erro no Webhook de ${courseName}:`, err.message);
    }
}

async function enviarFicheiroAoDiscord(ficheiro, cursoNome, cursoId) {
    // Busca a URL no dicionário de materiais
    const webhookUrl = WEBHOOKS_MATERIAIS[cursoId.toString()];

    if (!webhookUrl) {
        console.log(`⚠️ Sem canal de materiais para: ${cursoNome}`);
        return;
    }

    const dataBR = new Date(ficheiro.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const payload = {
        content: `📁 **NOVO MATERIAL DISPONÍVEL** 📁\n\n` +
                `**Matéria:** ${cursoNome}\n` +
                `**Arquivo:** ${ficheiro.display_name}\n` +
                `**Data de Upload:** ${dataBR}\n\n` +
                 `🔗 **[BAIXAR ARQUIVO](${ficheiro.url})**`
    };

    try {
        await axios.post(webhookUrl, payload);
        console.log(`🚀 Material enviado para o Discord: ${ficheiro.display_name}`);
    } catch (err) {
        console.error(`❌ Erro no Webhook de materiais (${cursoNome}):`, err.message);
    }
}

module.exports = {
    enviarTarefaAoDiscord,
    enviarFicheiroAoDiscord
};
