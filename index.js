import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

// DICCIONARIO MANUAL DE SEGURIDAD (Para recetas clave que nadie tiene en inglés aún)
const TRADUCCIONES_MANUALES = {
    "encantar arma mangosta": "enchant weapon mongoose",
    "enchant weapon mongoose": "encantar arma mangosta",
    "encantar capa defensa": "enchant cloak defense",
    "enchant cloak defense": "encantar capa defensa",
    "formula encantar arma mangosta": "formula enchant weapon mongoose",
    "formula enchant weapon mongoose": "formula encantar arma mangosta"
};

function normalizarTexto(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function limpiarNombreArtesano(nombreCompleto) {
    return nombreCompleto.split('-')[0].replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ]/g, "").trim();
}

function parsearLuaGuildCrafts(lua) {
    console.log("[Parser] Iniciando lectura bilingüe avanzada...");
    
    RECETAS_DB = {};
    const baseRecetasMateriales = {}; 
    const mapaArtesanosPorNombreReceta = {}; 
    const diccionarioTraduccion = {}; 

    const lineas = lua.split(/\r?\n/);
    
    let esSeccionArtesanos = false;
    let jugadorActual = null;
    
    let idRecetaActual = null;
    let nombreRecetaActual = null;
    let materiales = [];
    let dentroDeReagents = false;
    let dentroDeUnReagent = false;
    let tempMatName = null;
    let tempMatCount = null;

    const misPersonajesExcluidos = [
        "kortha", "zorkian", "zaeth", "krakanth", "gbankguild", 
        "gaeth", "zarkant", "dragon", "zetk", "kizak", "default"
    ];

    for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i].trim();

        if (l.includes('"lastUpdate"') || l.includes('["lastUpdate"]')) {
            if (idRecetaActual && nombreRecetaActual) {
                baseRecetasMateriales[idRecetaActual] = {
                    nombre: nombreRecetaActual,
                    materiales: materiales.length > 0 ? materiales.join("\n") : "• _No requiere reactivos especiales._"
                };
            }
            esSeccionArtesanos = true; 
            continue;
        }

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
        else {
            const jugadorM = l.match(/^\["([^"]+)"\]\s*=\s*\{/) || l.match(/^"([^"]+)"\s*=\s*\{/);
            if (jugadorM && l.includes('-')) {
                const nombreLimpio = limpiarNombreArtesano(jugadorM[1]);
                jugadorActual = !misPersonajesExcluidos.includes(nombreLimpio.toLowerCase()) ? nombreLimpio : null;
                continue;
            }

            if (jugadorActual) {
                const idInternaM = l.match(/^\[(-?\d+)\]\s*=\s*\{/);
                if (idInternaM) {
                    idRecetaActual = idInternaM[1];
                    continue;
                }

                const nombreRecetaM = l.match(/\["name"\]\s*=\s*"([^"]+)"/) || l.match(/"name"\s*=\s*"([^"]+)"/);
                if (nombreRecetaM && idRecetaActual) {
                    const nombreRecetaPersonaje = nombreRecetaM[1].trim();
                    const llaveNormalizada = normalizarTexto(nombreRecetaPersonaje);

                    if (baseRecetasMateriales[idRecetaActual]) {
                        const nombreEnBase = baseRecetasMateriales[idRecetaActual].nombre;
                        if (nombreEnBase !== nombreRecetaPersonaje) {
                            diccionarioTraduccion[llaveNormalizada] = normalizarTexto(nombreEnBase);
                        }
                    }

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

    // CONSOLIDACIÓN DUAL + EXTRA DE AYUDA MANUAL
    for (const id in baseRecetasMateriales) {
        const datos = baseRecetasMateriales[id];
        const llaveEs = normalizarTexto(datos.nombre);

        if (llaveEs) {
            let todosLosArtesanos = [];
            
            if (mapaArtesanosPorNombreReceta[llaveEs]) {
                todosLosArtesanos = todosLosArtesanos.concat(mapaArtesanosPorNombreReceta[llaveEs]);
            }

            // Mapeo por traducciones automáticas detectadas en el LUA
            for (const llaveAlt in diccionarioTraduccion) {
                if (diccionarioTraduccion[llaveAlt] === llaveEs) {
                    if (mapaArtesanosPorNombreReceta[llaveAlt]) {
                        mapaArtesanosPorNombreReceta[llaveAlt].forEach(art => {
                            if (!todosLosArtesanos.includes(art)) todosLosArtesanos.push(art);
                        });
                    }
                }
            }

            // Mapeo por si acaso usando el diccionario manual
            const llaveManualIngles = TRADUCCIONES_MANUALES[llaveEs];
            if (llaveManualIngles && mapaArtesanosPorNombreReceta[llaveManualIngles]) {
                mapaArtesanosPorNombreReceta[llaveManualIngles].forEach(art => {
                    if (!todosLosArtesanos.includes(art)) todosLosArtesanos.push(art);
                });
            }

            const artesanosLista = todosLosArtesanos.length > 0
                ? todosLosArtesanos.join(", ")
                : "_Ninguno registrado en la hermandad._";

            const objetoReceta = {
                nombreOriginal: datos.nombre,
                materiales: datos.materiales,
                artesanos: artesanosLista
            };

            // Indexar en español
            RECETAS_DB[llaveEs] = objetoReceta;

            // Indexar bajo su equivalente dinámico (LUA)
            for (const llaveAlt in diccionarioTraduccion) {
                if (diccionarioTraduccion[llaveAlt] === llaveEs) {
                    RECETAS_DB[llaveAlt] = objetoReceta; 
                }
            }

            // Indexar bajo su equivalente estático (Diccionario Manual)
            if (llaveManualIngles) {
                RECETAS_DB[llaveManualIngles] = objetoReceta;
            }
        }
    }

    console.log(`[Parser] Indexación bilingüe completada con éxito.`);
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('¡Bot Bilingüe Parcheado Activo!'));

client.on('message_create', async (msg) => {
    if (msg.hasMedia && msg.type === 'document') {
        const media = await msg.downloadMedia();
        if (media.filename && media.filename.endsWith('.lua')) {
            try {
                const contenidoLua = Buffer.from(media.data, 'base64').toString('utf-8');
                parsearLuaGuildCrafts(contenidoLua);
                await msg.reply(`✅ *¡Base de datos bilingüe sincronizada!*`);
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

    let recetasUnicas = [];
    let llavesFiltradas = [];
    llavesEncontradas.forEach(k => {
        if (!recetasUnicas.includes(RECETAS_DB[k].nombreOriginal)) {
            recetasUnicas.push(RECETAS_DB[k].nombreOriginal);
            llavesFiltradas.push(k);
        }
    });

    if (llavesFiltradas.length === 1) {
        const receta = RECETAS_DB[llavesFiltradas[0]];
        let mensaje = `📜 *Receta / Recipe: ${receta.nombreOriginal}* 📜\n\n🛠️ *Materiales / Reagents:*\n${receta.materiales}\n\n👥 *Artesanos / Crafters:*\n${receta.artesanos}`;
        await msg.reply(mensaje);
    } else if (llavesFiltradas.length > 1) {
        let mCoincide = `🔍 Opciones encontradas / Options found for "${textoOriginal}":\n\n`;
        llavesFiltradas.slice(0, 15).forEach(k => { mCoincide += `• \`!${RECETAS_DB[k].nombreOriginal}\`\n`; });
        if (llavesFiltradas.length > 15) mCoincide += `\n_...y ${llavesFiltradas.length - 15} opciones más._`;
        await msg.reply(mCoincide);
    } else {
        await msg.reply(`❌ No se encontró ninguna receta / No recipe found for "${textoOriginal}".`);
    }
});

client.initialize();
