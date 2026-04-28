/**
 * studyContentGenerator.js
 * Gera conteúdo de estudo usando a API do Groq (Llama 3), que é 100% gratuita.
 */

const axios = require('axios');

const delay = ms => new Promise(res => setTimeout(res, ms));

function getTipoAtividade(materia) {
    const n = materia.toLowerCase();
    if (n.includes('criativa') || n.includes('modelos') || n.includes('poo') || n.includes('orientada a objetos')) {
        return 'exercicio';
    }
    return 'flashcards'; // Performance, Filosofia, Segurança
}

async function gerarConteudoComIA(materia, materiais, tentativas = 0) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY não configurada');

    const tipo = getTipoAtividade(materia);
    const materiaisTexto = materiais.length > 0
        ? materiais.map(m => `- ${m}`).join('\n')
        : '- Conteúdo geral da disciplina (sem materiais recentes disponíveis)';

    let prompt = '';

    if (materia.toLowerCase().includes('experiência criativa') || materia.toLowerCase().includes('experiencia criativa')) {
        prompt = `Você é um tutor universitário. O aluno cursa "${materia}".
Últimos materiais:
${materiaisTexto}

Seu objetivo é gerar um pequeno desafio prático. Escolha ALEATORIAMENTE UMA destas duas opções:
OPÇÃO 1: Implementação de um CRUD muito simples no terminal/console, com uma lista curta de requisitos lógicos (não envolva HTML/CSS nesta opção).
OPÇÃO 2: Criação de uma página estática simples com HTML e CSS puros, focando na estilização e estrutura de uma tela que siga requisitos específicos (sem backend).

Formato JSON EXATO:
{
  "tipo": "exercicio",
  "exercicio": {
    "titulo": "Título do Desafio (ex: Sistema de Loja ou Tela de Login)",
    "cenario": "Contexto rápido e direto do problema.",
    "requisitos": ["Requisito técnico 1", "Requisito técnico 2", "Restrição 1"],
    "passos": ["Passo inicial", "Meio do desenvolvimento", "Validação final"]
  }
}
Responda em português. Apenas retorne um objeto JSON válido correspondente à estrutura acima.`;
    } else if (tipo === 'exercicio') {
        prompt = `Você é um tutor universitário. O aluno cursa "${materia}".
Últimos materiais:
${materiaisTexto}

Gere um PROBLEMA PRÁTICO para o aluno resolver. Formato JSON EXATO:
{
  "tipo": "exercicio",
  "exercicio": {
    "titulo": "Título da Atividade Prática",
    "cenario": "Descreva um cenário realístico de 1 ou 2 parágrafos contextualizando o problema.",
    "requisitos": ["Requisito técnico 1", "Requisito técnico 2", "Restrição 1"],
    "passos": ["Passo inicial", "Meio do desenvolvimento", "Validação final"]
  }
}
Responda em português. Apenas retorne um objeto JSON válido correspondente à estrutura acima.`;
    } else {
        prompt = `Você é um tutor universitário. O aluno cursa "${materia}".
Últimos materiais:
${materiaisTexto}

Gere EXATAMENTE 30 FLASHCARDS para memorização e estudo ativo.
Se o material fornecido for muito curto, complemente com conceitos fundamentais e avançados gerais de "${materia}" para garantir que sejam gerados 30 flashcards. É obrigatório gerar pelo menos 30.
Formato JSON EXATO:
{
  "tipo": "flashcards",
  "flashcards": [
    { "frente": "Conceito ou pergunta 1", "verso": "Definição direta 1" },
    { "frente": "Conceito ou pergunta 2", "verso": "Definição direta 2" }
  ]
}
Responda em português. Apenas retorne um objeto JSON válido correspondente à estrutura acima.`;
    }

    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.3-70b-versatile', // Modelo mais atualizado da Meta
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            response_format: { type: "json_object" }
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const jsonText = response.data.choices[0].message.content;
        return JSON.parse(jsonText);
    } catch (e) {
        // Groq Rate limits (HTTP 429) ou Erro de Parse JSON
        if (e.response && e.response.status === 429 && tentativas < 2) {
            console.log(`⏳ Groq sobrecarregado (Rate Limit). Aguardando 20 segundos antes de tentar ${materia} de novo...`);
            await delay(20000); // Espera 20 segundos
            return gerarConteudoComIA(materia, materiais, tentativas + 1);
        }
        
        console.log(`⚠️ Falha na IA ao gerar ${materia} (${e.message}). Usando fallback.`);
        return gerarConteudoComTemplates(materia, materiais, tipo);
    }
}

function gerarConteudoComTemplates(materia, materiais, tipo) {
    const listaMateriais = materiais.length > 0 ? materiais.join(', ') : 'suas anotações das aulas anteriores';
    if (tipo === 'exercicio') {
        return {
            tipo: "exercicio",
            exercicio: {
                titulo: `Prática Autodirigida: ${materia}`,
                cenario: `A inteligência artificial falhou. Seu desafio prático de hoje é construir um caso de uso real que aplique os conceitos vistos nos materiais: ${listaMateriais}. Imagine que você foi contratado para resolver um problema numa empresa utilizando estritamente este conteúdo.`,
                requisitos: [
                    "Identificar os 3 conceitos mais importantes dos materiais.",
                    "Criar um rascunho de solução (código/fluxograma) que incorpore esses conceitos.",
                    "Verificar possíveis gargalos sob estresse."
                ],
                passos: [
                    "1. Faça uma leitura ativa dos materiais recentes.",
                    "2. Desenhe a arquitetura da solução.",
                    "3. Desenvolva passo a passo, anotando dúvidas.",
                    "4. Teste os cenários de falha."
                ]
            }
        };
    } else {
        return {
            tipo: "flashcards",
            flashcards: [
                { frente: `Conceito Base: Qual a definição central apresentada nos últimos materiais de ${materia}?`, verso: "Descreva com suas próprias palavras." },
                { frente: `Aplicação Prática: Onde esse conceito pode ser usado no mercado de trabalho real?`, verso: "Pense em ferramentas ou processos." },
                { frente: `Comparação: Como o tema se diferencia do que foi visto antes?`, verso: "Liste 2 ou 3 diferenças principais." },
                { frente: `Vantagens: Quais os benefícios de utilizar as técnicas do material?`, verso: "Cite as principais vantagens de eficiência." },
                { frente: `Desvantagens e Riscos: Existem pontos cegos?`, verso: "Identifique os possíveis 'trade-offs'." },
                { frente: `Síntese Máxima: Resuma toda a essência da aula em uma única frase.`, verso: "Crie um bordão para esse conteúdo." }
            ]
        };
    }
}

async function gerarConteudoEstudo(materia, materiais) {
    try {
        console.log(`🤖 Gerando ${getTipoAtividade(materia)} com Groq (Llama 3) para: ${materia}...`);
        const conteudo = await gerarConteudoComIA(materia, materiais);
        return conteudo;
    } catch (error) {
        console.log(`⚠️ IA falhou (${error.message}). Usando templates para: ${materia}`);
        return gerarConteudoComTemplates(materia, materiais, getTipoAtividade(materia));
    }
}

module.exports = { gerarConteudoEstudo, gerarConteudoComTemplates, getTipoAtividade };
