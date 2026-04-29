const { sincronizarTarefas } = require('./syncAssignments');
const { sincronizarMateriais } = require('./syncMaterials');
const { executarPlanner } = require('./weeklyPlanner');

async function main() {
    console.log('🤖 Iniciando Robô do Canvas LMS...');
    
    // Executa as rotinas de sincronização sequencialmente
    await sincronizarMateriais();
    await sincronizarTarefas();

    // Executa o planejador semanal (gera roteiro) apenas se acionado pelo planner.yml
    if (process.env.RUN_PLANNER === "true") {
        await executarPlanner();
    }

    console.log('\n🏁 Rotina finalizada.');
}

main();