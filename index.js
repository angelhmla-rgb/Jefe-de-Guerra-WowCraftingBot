client.on('message_create', async (msg) => {
    // 1. PRIMERO REVISAMOS SI ES EL ARCHIVO LUA (Antes de validar comandos)
    if (msg.hasMedia && msg.type === 'document') {
        const media = await msg.downloadMedia();
        if (media.filename && media.filename.endsWith('.lua')) {
            try {
                const contenidoLua = Buffer.from(media.data, 'base64').toString('utf-8');
                parsearLuaGuildCrafts(contenidoLua);
                await msg.reply(`✅ *¡Base de datos cargada!* (${Object.keys(RECETAS_DB).length} elementos indexados).`);
                return;
            } catch (err) {
                await msg.reply(`❌ Error al cargar LUA: ${err.message}`);
                return;
            }
        }
    }

    // 2. LUEGO PROCESAMOS LOS COMANDOS
    let textoOriginal = msg.body.trim();
    let textoLower = textoOriginal.toLowerCase();
    
    if (textoLower.startsWith('!receta ')) {
        textoOriginal = textoOriginal.substring(8).trim();
        textoLower = textoOriginal.toLowerCase();
    } else if (textoLower.startsWith('!')) {
        textoOriginal = textoOriginal.substring(1).trim();
        textoLower = textoOriginal.toLowerCase();
    } else {
        return; // Ignorar si no es comando ni un archivo válido
    }

    if (textoLower === 'lista') {
        const llaves = Object.keys(RECETAS_DB);
        if (llaves.length === 0) {
            await msg.reply("⚠️ La base de datos está vacía.");
            return;
        }
        const muestra = llaves.slice(0, 30).map(k => `• ${RECETAS_DB[k].nombreOriginal}`).join("\n");
        await msg.reply(`📋 *Muestra de elementos (Primeras 30):*\n\n${muestra}`);
        return;
    }

    if (Object.keys(RECETAS_DB).length === 0) {
        await msg.reply(`⚠️ La base de datos está vacía. Reenvía el archivo *GuildCrafts.lua*.`);
        return;
    }

    const busquedaNormalizada = normalizarTexto(textoOriginal);
    let llavesEncontradas = Object.keys(RECETAS_DB).filter(k => k.includes(busquedaNormalizada));

    if (llavesEncontradas.length === 1) {
        const receta = RECETAS_DB[llavesEncontradas[0]];
        let mensaje = `📜 *Elemento: ${receta.nombreOriginal}* 📜\n\n`;
        mensaje += `🛠️ *Componentes / Detalles:*\n${receta.materiales}\n\n`;
        mensaje += `👥 _Revisa la disponibilidad en la hermandad._`;
        await msg.reply(mensaje);
    } else if (llavesEncontradas.length > 1) {
        let mensajeCoincidencias = `🔍 Encontré varias opciones para "${textoOriginal}":\n\n`;
        llavesEncontradas.slice(0, 15).forEach(k => {
            mensajeCoincidencias += `• \`!${RECETAS_DB[k].nombreOriginal}\`\n`;
        });
        if (llavesEncontradas.length > 15) {
            mensajeCoincidencias += `\n_...y ${llavesEncontradas.length - 15} opciones más._`;
        }
        await msg.reply(mensajeCoincidencias);
    } else {
        await msg.reply(`❌ No encontré ningún elemento que coincida con "${textoOriginal}".\n\n💡 _Tip: Intenta buscar materiales base como "seda", "plata" o "cuero" para verificar qué hay guardado._`);
    }
});
