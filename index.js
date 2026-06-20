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
    console.log("[Parser] Iniciando lectura del archivo GuildCrafts.lua...");
    
    // Dividimos por cada identificador de receta numérico ej: [12345] = {
    const bloques = contenidoLua.split(/\[\d+\]\s*=\s*\{/);
    RECETAS_DB = {};

    for (let i = 1; i < bloques.length; i++) {
        const bloque = bloques[i];

        // 1. Encontrar el nombre del elemento principal
        const nameMatch = bloque.match(/\["name"\]\s*=\s*"([^"]+)"/);
        if (!nameMatch) continue;
        const nombreReceta = nameMatch[1].trim();

        // Evitamos capturar líneas de configuración globales o repetidas
        if (nombreReceta.includes('recipeDB') || nombreReceta.includes('_recipeDB')) continue;

        const materiales = [];
        const artesanos = [];

        // 2. Extraer de forma flexible los materiales y sus cantidades
        // Buscamos cualquier patrón donde se asigne un "name" y un "count" consecutivamente en las líneas
        const lineasBloque = bloque.split('\n');
        let tempMatName = null;

        for (let j = 0; j < lineasBloque.length; j++) {
            const linea = lineasBloque[j];

            // Si encontramos un nombre de material interno
            const matNameMatch = linea.match(/\["name"\]\s*=\s*"([^"]+)"/);
            if (matNameMatch) {
                const encontrado = matNameMatch[1].trim();
                // Si es diferente al nombre del item principal, es un reactivo
                if (encontrado !== nombreReceta) {
                    tempMatName = encontrado;
                }
            }

            // Si encontramos la cantidad para ese reactivo
            const matCountMatch = linea.match(/(?:\["count"\]|\["num"\])\s*=\s*(\d+)/);
            if (matCountMatch && tempMatName) {
                materiales.push(`• ${matCountMatch[1]}x ${tempMatName}`);
                tempMatName = null; // Reseteamos para el siguiente material
            }

            // 3. Extraer nombres de artesanos de forma directa
            // Buscamos líneas que contengan nombres de jugadores asignados dentro del bloque de crafters/players
            // Normalmente se guardan en listas como ["NombreJugador"] = true o similares
            const playerMatch = linea.match(/\["([^"]+)"\]\s*=\s*(?:true|1)/);
            if (playerMatch) {
                const posibleJugador = playerMatch[1].trim();
                // Filtramos palabras clave del addon que no corresponden a jugadores
                const palabrasFiltro = ["name", "count", "num", "crafters", "players", "recipes", "id", "profession"];
                if (!palabrasFiltro.includes(posibleJugador.toLowerCase()) && posibleJugador !== nombreReceta) {
                    if (!artesanos.includes(posibleJugador)) {
                        artesanos.push(posibleJugador);
                    }
                }
            }
        }

        // Si la extracción línea por línea de artesanos no pescó, intentamos por bloque de texto general
        if (artesanos.length === 0) {
            const craftersBlock = bloque.match(/(?:crafters|players)\s*=\s*\{([^}]+)\}/i);
            if (craftersBlock) {
                const nombresSueltos = craftersBlock[1].match(/"([^"]+)"/g);
                if (nombresSueltos) {
                    nombresSueltos.forEach(nom => {
                        const limpio = nom.replace(/"/g, '').trim();
                        if (!artesanos.includes(limpio)) artesanos.push(limpio);
                    });
                }
            }
        }

        // Guardar en la base de datos indexada
        const llave = normalizarTexto(nombreReceta);
        if (llave) {
            RECETAS_DB[llave] = {
                nombreOriginal: nombreReceta,
                materiales: materiales.length > 0 ? materiales.join("\n") : "• _No se especificaron reactivos en este registro._",
                artesanos: artesanos.length > 0 ? artesanos.join(", ") : "_Ninguno registrado en el addon aún._"
            };
        }
    }

    console.log(`[Parser] Procesamiento finalizado. Elementos listos: ${Object.keys(RECETAS_DB).length}`);
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
                await msg.reply(`✅ *¡Base de datos cargada correctamente!* (${Object.keys(RECETAS_DB).length} elementos listos para consultar con materiales y artesanos).`);
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
