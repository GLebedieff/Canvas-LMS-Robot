const { sincronizarCursos } = require('./syncCourses');
const { sincronizarTarefas } = require('./syncAssignments');
const { sincronizarMateriais } = require('./syncMaterials');

async function main() {
    console.log('🤖 Iniciando Robô do Canvas LMS...');
    
    // Executa as rotinas de sincronização sequencialmente
    await sincronizarCursos();
    await sincronizarMateriais();
    await sincronizarTarefas();

    console.log('\n🏁 Rotina finalizada.');
}

main();