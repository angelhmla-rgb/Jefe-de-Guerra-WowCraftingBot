import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

function normalizarTexto(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function limpiarNombreArtesano(nombre) {
    return nombre.split('-')[0].trim();
}

function parsearLuaGuildCrafts(lua) {
    console.log("[Parser] Iniciando indexación de dos fases...");
    RECETAS_DB = {};
    
    // Diccionario temporal para buscar recetas rápido por su ID numérica
    const recetasPorID = {};
    // Mapeo temporal para acumular artesanos por ID de receta
    const artesanosPorID = {};

    const lineas = lua.split(/\r?\n/);
    
    let idRecetaActual = null;
    let nombreRecetaActual = null;
    let materiales = [];
    
    let dentroDeReagents = false;
    let dentroDeUnReagent = false;
    let tempMatName = null;
    let tempMatCount = null;

    // Variables para la Fase 2 (Lectura de Personajes y sus recetas conocidos)
    let jugadorActual = null;
    let enBloqueRecetasJugador = false;

    // Lista de tus personajes personales a excluir
    const misPersonajesExcluidos = [
        "kortha", "zorkian", "zaeth", "krakanth", "gbankguild", 
        "gaeth", "zarkant", "dragon", "zetk", "kizak"
    ];

    for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i].trim();

        // Evitar configuraciones muertas
        if (l.includes('="Default"') || l.includes('=\s*"Default"') || l.includes('"Default"')) {
            continue;
        }

        // --- FASE 1: LEER LA BASE DE DATOS DE RECETAS (_recipeDB) ---
        const inicioRecetaM = l.match(/^\[(-?\d+)\]\s*=\s*\{/);
        if (inicioRecetaM && !l.includes('_recipeDB') && !l.includes('GuildCraftsDB') && !enBloqueRecetasJugador) {
            // Guardar receta previa
            if (idRecetaActual && nombreRecetaActual) {
                recetasPorID[idRecetaActual] = {
                    nombre: nombreRecetaActual,
                    materiales: materiales.length > 0 ? materiales.join("\n") : "• _No se especificaron reactivos._"
                };
            }
            
            idRecetaActual = inicioRecetaM[1];
            nombreRecetaActual = null;
            materiales = [];
            dentroDeReagents = false;
            dentroDeUnReagent = false;
            tempMatName = null;
            tempMatCount = null;
            continue;
        }

        // Control de reactivos en Fase 1
        if (idRecetaActual && !enBloqueRecetasJugador) {
            if (l.startsWith('["reagents"]') || l.startsWith('"reagents"')) {
                dentroDeReagents = true;
                continue;
            }
            if (dentroDeReagents && l.startsWith('{')) {
                dentroDeUnReagent = true;
                continue;
            }
            if (dentroDeUnReagent && (l.startsWith('},') || l.startsWith('}'))) {
                if (tempMatName && tempMatCount) {
                    materiales.push(`• ${tempMatCount}x ${tempMatName}`);
                }
                tempMatName = null;
                tempMatCount = null;
                dentroDeUnReagent = false;
                continue;
            }
            if (dentroDeReagents && (l.startsWith('},') || l.startsWith('}'))) {
                dentroDeReagents = false;
                continue;
            }

            const nameM = l.match(/\["name"\]\s*=\s*"([^"]+)"/) || l.match(/"name"\s*=\s*"([^"]+)"/);
            if (nameM) {
                if (dentroDeUnReagent) {
                    tempMatName = nameM[1].trim();
                } else if (!nombreRecetaActual) {
                    nombreRecetaActual = nameM[1].trim();
                }
                continue;
            }

            const countM = l.match(/\["count"\]\s*=\s*(\d+)/) || l.match(/"count"\s*=\s*(\d+)/);
            if (countM && dentroDeUnReagent) {
                tempMatCount = countM[1];
                continue;
            }
        }

        // --- FASE 2: CAPTURA DINÁMICA DE ARTESANOS (Ej: ["Zaenghun-Dreamscythe"]) ---
        // Detecta líneas como: ["Zaenghun-Dreamscythe"] = {
        const jugadorM = l.match(/^\["([^"]+)-Dreamscythe"\]\s*=\s*\{/) || l.match(/^"([^"]+)-Dreamscythe"\s*=\s*\{/);
        if (jugadorM) {
            // Cerramos cualquier lectura anterior de receta de la Fase 1
            if (idRecetaActual && nombreRecetaActual) {
                recetasPorID[idRecetaActual] = {
                    nombre: nombreRecetaActual,
                    materiales: materiales.length > 0 ? materiales.join("\n") : "• _No se especificaron reactivos._"
                };
                idRecetaActual = null;
            }

            const nombreLimpio = limpiarNombreArtesano(jugadorM[1]);
            if (!misPersonajesExcluidos.includes(nombreLimpio.toLowerCase())) {
                jugadorActual = nombreLimpio;
            } else {
                jugadorActual = null; // Ignorar si es un personaje tuyo
            }
            enBloqueRecetasJugador = false;
            continue;
        }

        // Detectar si entramos al sub-bloque de recetas del jugador actual (ej: ["recipes"] = {)
        if (jugadorActual && (l.startsWith('["recipes"]') || l.startsWith('"recipes"'))) {
            enBloqueRecetasJugador = true;
            continue;
        }

        // Si estamos dentro de las recetas del jugador, capturamos las IDs que posee
        if (jugadorActual && enBloqueRecetasJugador) {
            // Busca patrones de IDs dentro del perfil del personaje como: [-33992] = true, o [8175] = true,
            const idM = l.match(/^\[(-?\d+)\]\s*=\s*/);
            if (idM) {
                const idRecetaConocida = idM[1];
                if (!artesanosPorID[idRecetaConocida]) {
                    artesanosPorID[idRecetaConocida] = [];
                }
                if (!artesanosPorID[idRecetaConocida].includes(jugadorActual)) {
                    artesanosPorID[idRecetaConocida].push(jugadorActual);
                }
            }
        }

        // Si el bloque del jugador se cierra por completo
        if (l === '},' || l === '}') {
            if (enBloqueRecetasJugador && !l.includes('=')) {
                enBloqueRecetasJugador = false; 
            }
        }
    }

    // Guardar último residuo si quedó colgado de la Fase 1
    if (idRecetaActual && nombreRecetaActual) {
        recetasPorID[idRecetaActual] = {
            nombre: nombreRecetaActual,
            materiales: materiales.length > 0 ? materiales.join("\n") : "• _No se especificaron reactivos._"
        };
    }

    // --- ENSAMBLADO FINAL DE LA BASE DE DATOS ---
    // Unimos los materiales de cada ID con la lista de artesanos que recolectamos en la Fase 2
    for (const id in recetasPorID) {
        const datosReceta = recetasPorID[id];
        const llaveNormalizada = normalizarTexto(datosReceta.nombre);
        
        const listaArtesanos = artesanosPorID[id] && artesanosPorID[id].length > 0 
            ? artesanosPorID[id].join(", ") 
            : "_Ningún artesano registrado en la hermandad._";

        if (llaveNormalizada) {
            RECETAS_DB[llaveNormalizada] = {
                nombreOriginal: datosReceta.nombre,
                materiales: datosReceta.materiales,
                artesanos: listaArtesanos
            };
        }
    }

    console.log(`[Parser] Indexación completada. Elementos finales: ${Object.keys(RECETAS_DB).length}`);
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('¡Bot Activo!'));

client.on('message_create', async (msg) => {
    if (msg.hasMedia && msg.type === 'document') {
        const media = await msg.downloadMedia();
        if (media.filename && media.filename.endsWith('.lua')) {
            try {
                const contenidoLua = Buffer.from(media.data, 'base64').toString('utf-8');
                parsearLuaGuildCrafts(contenidoLua);
                await msg.reply(`✅ *¡Base de datos cargada!* (${Object.keys(RECETAS_DB).length} elementos listos).`);
                return;
            } catch (err) {
                await msg.reply(`❌ Error: ${err.message}`);
                return;
            }
        }
    }

    let textoOriginal = msg.body.trim();
    let textoLower = textoOriginal.toLowerCase();
    
    if (textoLower.startsWith('!receta ')) {
        textoOriginal = textoOriginal.substring(8).trim();
    } else if (textoLower.startsWith('!')) {
        textoOriginal = textoOriginal.substring(1).trim();
    } else {
        return; 
    }

    if (textoOriginal.toLowerCase() === 'lista') {
        const llaves = Object.keys(RECETAS_DB);
        if (llaves.length === 0) return msg.reply("⚠️ Base de datos vacía.");
        const muestra = llaves.slice(0, 30).map(k => `• ${RECETAS_DB[k].nombreOriginal}`).join("\n");
        return msg.reply(`📋 *Muestra (Primeras 30):*\n\n${muestra}`);
    }

    if (Object.keys(RECETAS_DB).length === 0) {
        return msg.reply(`⚠️ Reenvía el archivo *GuildCrafts.lua*.`);
    }

    const busquedaNormalizada = normalizarTexto(textoOriginal);
    let llavesEncontradas = Object.keys(RECETAS_DB).filter(k => k.includes(busquedaNormalizada));

    if (llavesEncontradas.length === 1) {
        const receta = RECETAS_DB[llavesEncontradas[0]];
        let mensaje = `📜 *Receta: ${receta.nombreOriginal}* 📜\n\n🛠️ *Materiales:*\n${receta.materiales}\n\n👥 *Artesanos:*\n${receta.artesanos}`;
        await msg.reply(mensaje);
    } else if (llavesEncontradas.length > 1) {
        let mCoincide = `🔍 Opciones para "${textoOriginal}":\n\n`;
        llavesEncontradas.slice(0, 15).forEach(k => { mCoincide += `• \`!${RECETAS_DB[k].nombreOriginal}\`\n`; });
        if (llavesEncontradas.length > 15) mCoincide += `\n_...y ${llavesEncontradas.length - 15} más._`;
        await msg.reply(mCoincide);
    } else {
        await msg.reply(`❌ No encontré "${textoOriginal}".`);
    }
});

client.initialize();
