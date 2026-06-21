import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

function normalizarTexto(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function limpiarNombreArtesano(nombreCompleto) {
    return nombreCompleto.split('-')[0].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, "").trim();
}

function parsearLuaGuildCrafts(lua) {
    console.log("[Parser] Iniciando lectura línea por línea...");
    
    // Reiniciamos diccionarios
    RECETAS_DB = {};
    const baseRecetasMateriales = {}; // Guarda ID -> { nombre, materiales }
    const mapaArtesanosPorNombreReceta = {}; // Guarda NombreReceta -> Lista de Artesanos

    const lineas = lua.split(/\r?\n/);
    
    // Variables de control
    let esSeccionArtesanos = false;
    let jugadorActual = null;
    
    // Variables para Fase 1 (Materiales)
    let idRecetaActual = null;
    let nombreRecetaActual = null;
    let materiales = [];
    let dentroDeReagents = false;
    let dentroDeUnReagent = false;
    let tempMatName = null;
    let tempMatCount = null;

    // Lista de exclusión de perfiles tuyos o del sistema
    const misPersonajesExcluidos = [
        "kortha", "zorkian", "zaeth", "krakanth", "gbankguild", 
        "gaeth", "zarkant", "dragon", "zetk", "kizak", "default"
    ];

    for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i].trim();

        // Detectar el cambio de sección mediante "lastUpdate"
        if (l.includes('"lastUpdate"') || l.includes('["lastUpdate"]')) {
            // Guardamos la última receta de la sección de materiales si quedó pendiente
            if (idRecetaActual && nombreRecetaActual) {
                baseRecetasMateriales[idRecetaActual] = {
                    nombre: nombreRecetaActual,
                    materiales: materiales.length > 0 ? materiales.join("\n") : "• _No requiere reactivos especiales._"
                };
            }
            esSeccionArtesanos = true; 
            continue;
        }

        // ==========================================
        // FASE 1: ARRIBA DE "lastUpdate" (MATERIALES)
        // ==========================================
        if (!esSeccionArtesanos) {
            const inicioRecetaM = l.match(/^\[(-?\d+)\]\s*=\s*\{/);
            if (inicioRecetaM && !l.includes('_recipeDB') && !l.includes('GuildCraftsDB')) {
                if (idRecetaActual && nombreRecetaActual) {
                    baseRecetasMateriales[idRecetaActual] = {
                        nombre: nombreRecetaActual,
                        materiales: materiales.length > 0 ? materiales.join("\n") : "• _No requiere reactivos especiales._"
                    };
                }
                idRecetaActual = inicioRecetaM[1];
                nombreRecetaActual = null;
                materiales = [];
                dentroDeReagents = false;
                dentroDeUnReagent = false;
                continue;
            }

            if (idRecetaActual) {
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
                    if (dentroDeUnReagent) tempMatName = nameM[1].trim();
                    else if (!nombreRecetaActual) nombreRecetaActual = nameM[1].trim();
                    continue;
                }

                const countM = l.match(/\["count"\]\s*=\s*(\d+)/) || l.match(/"count"\s*=\s*(\d+)/);
                if (countM && dentroDeUnReagent) {
                    tempMatCount = countM[1];
                    continue;
                }
            }
        } 
        
        // ==========================================
        // FASE 2: ABAJO DE "lastUpdate" (ARTESANOS)
        // ==========================================
        else {
            // Detectar un nuevo jugador (Ej: ["Zaenghun-Dreamscythe"] = {)
            const jugadorM = l.match(/^\["([^"]+)"\]\s*=\s*\{/) || l.match(/^"([^"]+)"\s*=\s*\{/);
            if (jugadorM && l.includes('-')) {
                const nombreLimpio = limpiarNombreArtesano(jugadorM[1]);
                if (!misPersonajesExcluidos.includes(nombreLimpio.toLowerCase())) {
                    jugadorActual = nombreLimpio;
                } else {
                    jugadorActual = null;
                }
                continue;
            }

            // Si tenemos un jugador válido activo, buscamos los nombres de sus recetas internas
            if (jugadorActual) {
                const nombreRecetaM = l.match(/\["name"\]\s*=\s*"([^"]+)"/) || l.match(/"name"\s*=\s*"([^"]+)"/);
                if (nombreRecetaM) {
                    const nombreRecetaPersonaje = nombreRecetaM[1].trim();
                    const llaveNormalizada = normalizarTexto(nombreRecetaPersonaje);

                    if (!mapaArtesanosPorNombreReceta[llaveNormalizada]) {
                        mapaArtesanosPorNombreReceta[llaveNormalizada] = [];
                    }
                    if (!mapaArtesanosPorNombreReceta[llaveNormalizada].includes(jugadorActual)) {
                        mapaArtesanosPorNombreReceta[llaveNormalizada].push(jugadorActual);
                    }
                }
            }
        }
    }

    // ==========================================
    // FASE 3: ENSAMBLAJE FINAL DE AMBAS PARTES
    // ==========================================
    for (const id in baseRecetasMateriales) {
        const datos = baseRecetasMateriales[id];
        const llave = normalizarTexto(datos.nombre);

        if (llave) {
            const artesanosLista = mapaArtesanosPorNombreReceta[llave] && mapaArtesanosPorNombreReceta[llave].length > 0
                ? mapaArtesanosPorNombreReceta[llave].join(", ")
                : "_Ninguno registrado en la hermandad._";

            RECETAS_DB[llave] = {
                nombreOriginal: datos.nombre,
                materiales: datos.materiales,
                artesanos: artesanosLista
            };
        }
    }

    console.log(`[Parser] Indexación completada con éxito. Total recetas utilizables: ${Object.keys(RECETAS_DB).length}`);
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('¡Bot de Profesiones Activo!'));

client.on('message_create', async (msg) => {
    if (msg.hasMedia && msg.type === 'document') {
        const media = await msg.downloadMedia();
        if (media.filename && media.filename.endsWith('.lua')) {
            try {
                const contenidoLua = Buffer.from(media.data, 'base64').toString('utf-8');
                parsearLuaGuildCrafts(contenidoLua);
                await msg.reply(`✅ *¡Base de datos sincronizada!* Se cargaron exitosamente las recetas de la hermandad con sus respectivos artesanos.`);
                return;
            } catch (err) {
                await msg.reply(`❌ Error al procesar archivo: ${err.message}`);
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
        return msg.reply(`⚠️ Envía primero el archivo *GuildCrafts.lua*.`);
    }

    const busquedaNormalizada = normalizarTexto(textoOriginal);
    let llavesEncontradas = Object.keys(RECETAS_DB).filter(k => k.includes(busquedaNormalizada));

    if (llavesEncontradas.length === 1) {
        const receta = RECETAS_DB[llavesEncontradas[0]];
        let mensaje = `📜 *Receta: ${receta.nombreOriginal}* 📜\n\n🛠️ *Materiales:*\n${receta.materiales}\n\n👥 *Artesanos en la Hermandad:*\n${receta.artesanos}`;
        await msg.reply(mensaje);
    } else if (llavesEncontradas.length > 1) {
        let mCoincide = `🔍 Opciones encontradas para "${textoOriginal}":\n\n`;
        llavesEncontradas.slice(0, 15).forEach(k => { mCoincide += `• \`!${RECETAS_DB[k].nombreOriginal}\`\n`; });
        if (llavesEncontradas.length > 15) mCoincide += `\n_...y ${llavesEncontradas.length - 15} opciones más._`;
        await msg.reply(mCoincide);
    } else {
        await msg.reply(`❌ No se encontró ninguna receta que coincida con "${textoOriginal}".`);
    }
});

client.initialize();
