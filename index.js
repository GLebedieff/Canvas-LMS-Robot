const { sincronizarTarefas } = require('./syncAssignments');
const { sincronizarMateriais } = require('./syncMaterials');

async function main() {
    console.log('🤖 Iniciando Robô do Canvas LMS...');
    
    // Executa ambas as rotinas de sincronização sequencialmente
    await sincronizarMateriais();
    await sincronizarTarefas();

    console.log('\n🏁 Rotina finalizada.');
}

main();