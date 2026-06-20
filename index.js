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
    
    // Dividir el archivo por bloques de recetas en lugar de ir línea por línea
    // Esto nos permite capturar de forma exacta todo lo que pertenece a un objeto.
    const bloques = contenidoLua.split(/\[\d+\]\s*=\s*\{/);
    RECETAS_DB = {};

    console.log(`[Parser] Bloques detectados preliminarmente: ${bloques.length}`);

    for (let i = 1; i < bloques.length; i++) {
        const bloque = bloques[i];

        // 1. Extraer el nombre de la receta / item principal
        const nameMatch = bloque.match(/\["name"\]\s*=\s*"([^"]+)"/);
        if (!nameMatch) continue;
        const nombreReceta = nameMatch[1].trim();

        // 2. Extraer los materiales
        // Buscamos todas las ocurrencias de materiales dentro de la subestructura del bloque
        const materiales = [];
        const regexMateriales = /\{\s*\["name"\]\s*=\s*"([^"]+)"\s*,\s*\["count"\]\s*=\s*(\d+)/g;
        let matMatch;
        
        while ((matMatch = regexMateriales.exec(bloque)) !== null) {
            materiales.push(`• ${matMatch[2]}x ${matMatch[1]}`);
        }

        // Si la regex anterior no pesca por el orden, intentamos una variante común de Lua
        if (materiales.length === 0) {
            const regexMaterialesAlt = /\{\s*\["count"\]\s*=\s*(\d+)\s*,\s*\["name"\]\s*=\s*"([^"]+)"/g;
            while ((matMatch = regexMaterialesAlt.exec(bloque)) !== null) {
                materiales.push(`• ${matMatch[1]}x ${matMatch[2]}`);
            }
        }

        // 3. Extraer los artesanos (Miembros de la hermandad que la conocen)
        // El addon suele listar los nombres de los jugadores en un bloque llamado ["crafters"] o similar
        const artesanos = [];
        const regexCrafters = /\["crafters"\]\s*=\s*\{([^}]+)\}/;
        const craftersBlock = bloque.match(regexCrafters);
        
        if (craftersBlock) {
            // Extrae todos los nombres entre comillas dentro del bloque de crafters
            const nombresMatch = craftersBlock[1].match(/"([^"]+)"/g);
            if (nombresMatch) {
                nombresMatch.forEach(nom => {
                    artesanos.push(nom.replace(/"/g, '').trim());
                });
            }
        }

        // Si no se encuentra estructura de crafters, buscamos nombres sueltos asignados al ID
        if (artesanos.length === 0) {
            const regexJugadoresSueltos = /\["players"\]\s*=\s*\{([^}]+)\}/;
            const playersBlock = bloque.match(regexJugadoresSueltos);
            if (playersBlock) {
                const nombresMatch = playersBlock[1].match(/"([^"]+)"/g);
                if (nombresMatch) {
                    nombresMatch.forEach(nom => {
                        artesanos.push(nom.replace(/"/g, '').trim());
                    });
                }
            }
        }

        // Guardar la receta procesada en nuestra base de datos organizada
        const llave = normalizarTexto(nombreReceta);
        if (llave) {
            RECETAS_DB[llave] = {
                nombreOriginal: nombreReceta,
                materiales: materiales.length > 0 ? materiales.join("\n") : "• _No se encontraron reactivos específicos en el archivo._",
                artesanos: artesanos.length > 0 ? artesanos.join(", ") : "_Ninguno registrado en el addon aún._"
            };
        }
    }

    console.log(`[Parser] Procesamiento finalizado. Elementos indexados listos: ${Object.keys(RECETAS_DB).length}`);
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('¡Bot Activo!'));

client.on('message_create', async (msg) => {
    // 1. REVISAR SI ES EL ARCHIVO LUA
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
