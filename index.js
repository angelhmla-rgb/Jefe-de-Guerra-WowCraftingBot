import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

// Quita acentos y caracteres raros para comparar limpiamente
function normalizarTexto(texto) {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9 ]/g, "")
        .trim();
}

function parsearLuaGuildCrafts(contenidoLua) {
    console.log("[Parser] Iniciando mapeo global de GuildCrafts.lua...");
    RECETAS_DB = {};

    // 1. Mapear IDs a Nombres de recetas
    // Busca patrones tipo: [12345] = { ["name"] = "Elixir de la mangosta" ... }
    // O también estructuras planas como: [12345] = "Elixir de la mangosta"
    const mapaIdANombre = {};
    const regexNombres = /\[(\d+)\]\s*=\s*(?:\{\s*\["name"\]\s*=\s*"([^"]+)"|["']([^"']+)["'])/g;
    let match;
    
    while ((match = regexNombres.exec(contenidoLua)) !== null) {
        const id = match[1];
        const nombre = match[2] || match[3];
        if (nombre && !nombre.includes('recipeDB')) {
            mapaIdANombre[id] = nombre.trim();
        }
    }

    // 2. Crear contenedores temporales para ingredientes y creadores por ID
    const mapaMateriales = {};
    const mapaArtesanos = {};

    // Inicializar mapas para cada ID detectado
    Object.keys(mapaIdANombre).forEach(id => {
        mapaMateriales[id] = [];
        mapaArtesanos[id] = [];
    });

    // 3. Extraer sub-bloques del archivo usando una división por bloques numéricos [id] = { ... }
    const bloques = contenidoLua.split(/\[(\d+)\]\s*=\s*\{/);
    
    for (let i = 1; i < bloques.length; i += 2) {
        const id = bloques[i];
        const cuerpoBloque = bloques[i + 1];
        if (!cuerpoBloque) continue;

        // --- Extracción de Materiales en el bloque del ID ---
        // Busca patrones comunes de materiales del tipo: ["name"] = "Seda", ["count"] = 4
        const lineas = cuerpoBloque.split('\n');
        let tempMatName = null;
        
        for (let j = 0; j < lineas.length; j++) {
            const linea = lineas[j];
            
            const matNameMatch = linea.match(/\["name"\]\s*=\s*"([^"]+)"/);
            if (matNameMatch) {
                tempMatName = matNameMatch[1].trim();
            }
            
            const matCountMatch = linea.match(/(?:\["count"\]|\["num"\])\s*=\s*(\d+)/);
            if (matCountMatch && tempMatName) {
                // Verificar que no se añada a sí mismo como material
                if (mapaIdANombre[id] !== tempMatName && mapaMateriales[id]) {
                    mapaMateriales[id].push(`• ${matCountMatch[1]}x ${tempMatName}`);
                }
                tempMatName = null;
            }

            // --- Extracción de Artesanos / Jugadores en el bloque ---
            // Busca claves estilo: ["NombrePersonaje"] = true o ["NombrePersonaje"] = 1
            const playerMatch = linea.match(/\["([^"]+)"\]\s*=\s*(?:true|1)/);
            if (playerMatch) {
                const jugador = playerMatch[1].trim();
                const ignorarclaves = ["name", "count", "num", "crafters", "players", "recipes", "id", "profession", "icon"];
                if (!ignorarclaves.includes(jugador.toLowerCase()) && jugador !== mapaIdANombre[id] && mapaArtesanos[id]) {
                    if (!mapaArtesanos[id].includes(jugador)) {
                        mapaArtesanos[id].push(jugador);
                    }
                }
            }
        }

        // Búsqueda secundaria de bloques compactos tipo crafters = { "PlayerA", "PlayerB" }
        const craftersBlock = cuerpoBloque.match(/(?:crafters|players)\s*=\s*\{([^}]+)\}/i);
        if (craftersBlock && mapaArtesanos[id]) {
            const nombresSueltos = craftersBlock[1].match(/"([^"]+)"/g);
            if (nombresSueltos) {
                nombresSueltos.forEach(nom => {
                    const limpio = nom.replace(/"/g, '').trim();
                    if (!mapaArtesanos[id].includes(limpio)) {
                        mapaArtesanos[id].push(limpio);
                    }
                });
            }
        }
    }

    // 4. Consolidar todo en la base de datos de consulta (RECETAS_DB) usando el nombre normalizado
    Object.keys(mapaIdANombre).forEach(id => {
        const nombreOriginal = mapaIdANombre[id];
        const llave = normalizarTexto(nombreOriginal);
        
        if (llave) {
            const mats = mapaMateriales[id] || [];
            const arts = mapaArtesanos[id] || [];

            RECETAS_DB[llave] = {
                nombreOriginal: nombreOriginal,
                materiales: mats.length > 0 ? mats.join("\n") : "• _No se encontraron reactivos en el archivo para este ID._",
                artesanos: arts.length > 0 ? arts.join(", ") : "_Ningún artesano registrado en el addon todavía._"
            };
        }
    });

    console.log(`[Parser] Indexación completada. Total de recetas legibles: ${Object.keys(RECETAS_DB).length}`);
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('¡Bot Activo!'));

client.on('message_create', async (msg) => {
    // 1. DETECTAR EL ARCHIVO .LUA
    if (msg.hasMedia && msg.type === 'document') {
        const media = await msg.downloadMedia();
        if (media.filename && media.filename.endsWith('.lua')) {
            try {
                const contenidoLua = Buffer.from(media.data, 'base64').toString('utf-8');
                parsearLuaGuildCrafts(contenidoLua);
                await msg.reply(`✅ *¡Base de datos cargada perfectamente!* (${Object.keys(RECETAS_DB).length} elementos listos para consultar con sus componentes y artesanos asignados).`);
                return;
            } catch (err) {
                await msg.reply(`❌ Error al procesar el archivo LUA: ${err.message}`);
                return;
            }
        }
    }

    // 2. PROCESAR COMANDOS
    let textoOriginal = msg.body.trim();
    let textoLower = textoOriginal.toLowerCase();
    
    if (textoLower.startsWith('!receta ')) {
        textoOriginal = textoOriginal.substring(8).trim();
        textoLower = textoOriginal.toLowerCase();
    } else if (textoLower.startsWith('!')) {
        textoOriginal = textoOriginal.substring(1).trim();
        textoLower = textoOriginal.toLowerCase();
    } else {
        return; 
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
        await msg.reply(`⚠️ La base de datos está vacía. Por favor, reenvía el archivo *GuildCrafts.lua*.`);
        return;
    }

    const busquedaNormalizada = normalizarTexto(textoOriginal);
    let llavesEncontradas = Object.keys(RECETAS_DB).filter(k => k.includes(busquedaNormalizada));

    if (llavesEncontradas.length === 1) {
        const receta = RECETAS_DB[llavesEncontradas[0]];
        let mensaje = `📜 *Receta: ${receta.nombreOriginal}* 📜\n\n`;
        mensaje += `🛠️ *Materiales Necesarios:*\n${receta.materiales}\n\n`;
        mensaje += `👥 *Artesanos que pueden craftearlo:*\n${receta.artesanos}`;
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
        await msg.reply(`❌ No encontré ningún elemento que coincida con "${textoOriginal}".`);
    }
});

client.initialize();
