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

module.exports = {
    notion,
    canvas,
    COURSES_DB_ID,
    ASSIGNMENTS_DB_ID,
    NOTION_MATERIAIS_AULA_DB_ID
};
