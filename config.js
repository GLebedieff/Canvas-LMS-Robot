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
// Adicionado para suportar a sincronização de materiais:
const NOTION_MATERIAIS_AULA_DB_ID = process.env.NOTION_MATERIAIS_AULA_DB_ID;

// Webhooks
const WEBHOOKS_ATIVIDADES = {
    '62337': process.env.DISCORD_ATIVIDADE_FILOSOFIA,
    '64033': process.env.DISCORD_ATIVIDADE_EXP_CRIATIVA,
    // Utilizando o fallback para tratar o caso de erro de digitação no .env original
    '64034': process.env.DISCORD_ATIVIDADE_SEGURANCA || process.env.DISOCRD_ATIVIDADE_SEGURANCA,
    '64098': process.env.DISCORD_ATIVIDADE_POO,
    '64035': process.env.DISCORD_ATIVIDADE_PERFORMANCE,
    '64032': process.env.DISCORD_ATIVIDADE_CRIACAO_MODELOS
};

const WEBHOOKS_MATERIAIS = {
    '62337': process.env.DISCORD_REPOSITORIO_FILOSOFIA,
    '64033': process.env.DISCORD_REPOSITORIO_EXP_CRIATIVA,
    // Utilizando o fallback para tratar o caso de erro de digitação no .env original
    '64034': process.env.DISCORD_REPOSITORIO_SEGURANCA || process.env.DISOCRD_REPOSITORIO_SEGURANCA,
    '64098': process.env.DISCORD_REPOSITORIO_POO,
    '64035': process.env.DISCORD_REPOSITORIO_PERFORMANCE,
    '64032': process.env.DISCORD_REPOSITORIO_CRIACAO_MODELOS
};

module.exports = {
    notion,
    canvas,
    COURSES_DB_ID,
    ASSIGNMENTS_DB_ID,
    NOTION_MATERIAIS_AULA_DB_ID,
    WEBHOOKS_ATIVIDADES,
    WEBHOOKS_MATERIAIS
};
