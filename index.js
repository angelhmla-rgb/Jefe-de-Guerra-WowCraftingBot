function parsearLuaGuildCrafts(lua) {
    console.log("=== INICIANDO ESCÁNER DE DIAGNÓSTICO ===");
    
    // 1. Intentar separar el bloque global del de los jugadores
    // Cortamos el archivo en dos partes usando "lastUpdate" como frontera
    const partes = lua.split(/\["lastUpdate"\]/);
    
    if (partes.length < 2) {
        console.log("❌ Error crítico: No se encontró la sección ['lastUpdate'] para dividir el archivo.");
        return;
    }

    const bloqueRecetas = partes[0]; // Todo lo que está arriba (el diccionario de recetas)
    const bloqueJugadores = partes[1]; // Todo lo que está abajo (los artesanos)

    // 2. Diagnóstico del Bloque de Recetas
    // Contamos cuántas llaves del tipo [número] = { hay en la primera mitad
    const coincidenciasRecetas = bloqueRecetas.match(/\[-?\d+\]\s*=\s*\{/g) || [];
    console.log(`📊 [Escáner] Recetas crudas encontradas en la primera mitad: ${coincidenciasRecetas.length}`);

    // 3. Diagnóstico del Bloque de Jugadores
    // Buscamos cuántos perfiles de "-Dreamscythe" hay en la segunda mitad
    const coincidenciasJugadores = bloqueJugadores.match(/\["([^"]+)-Dreamscythe"\]\s*=\s*\{/g) || [];
    console.log(`📊 [Escáner] Personajes de la hermandad detectados: ${coincidenciasJugadores.length}`);
    
    if (coincidenciasJugadores.length > 0) {
        console.log("👥 Primeros personajes detectados en el texto:");
        coincidenciasJugadores.slice(0, 5).forEach(j => console.log(`   • ${j}`));
    }

    console.log("=== FIN DEL ESCÁNER ===");
}
