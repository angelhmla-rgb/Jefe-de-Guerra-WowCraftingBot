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
        .replace(/[^a-z0-9 ]/g, "") // Remueve símbolos extraños
        .trim();
}

function parsearLuaGuildCrafts(contenidoLua) {
    console.log("[Parser] Iniciando lectura del archivo GuildCrafts.lua...");
    const lineas = contenidoLua.split(/\r?\n/);
    let recetaActual = null;
    let materialesActuales = [];
    let enBloqueRecipeDB = false;

    RECETAS_DB = {};

    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i].trim();

        // Detectar inicio de base de datos de recetas
        if (linea.includes('["_recipeDB"]') || linea.includes('["recipeDB"]')) {
            enBloqueRecipeDB = true;
            continue;
        }
        
        // Detectar fin del bloque de recetas
        if (enBloqueRecipeDB && (linea.startsWith('["Jefe de Guerra') || linea.startsWith('["professions"]'))) {
            if (recetaActual) {
                const llave = normalizarTexto(recetaActual);
                if (llave) {
                    RECETAS_DB[llave] = {
                        nombreOriginal: recetaActual,
                        materiales: materialesActuales.length > 0 ? materialesActuales.join("\n") : "• _Materiales no especificados._"
                    };
                }
            }
            enBloqueRecipeDB = false;
        }

        if (enBloqueRecipeDB) {
            // Si inicia un nuevo bloque numérico (ej: [12345] = {), guardamos la receta anterior
            if (linea.match(/^\[\d+\]\s*=\s*\{/) || linea.startsWith('},')) {
                if (recetaActual) {
                    const llave = normalizarTexto(recetaActual);
                    if (llave) {
                        RECETAS_DB[llave] = {
                            nombreOriginal: recetaActual,
                            materiales: materialesActuales.length > 0 ? materialesActuales.join("\n") : "• _Materiales no especificados._"
                        };
                    }
                }
                recetaActual = null;
                materialesActuales = [];
                continue;
            }

            // Capturar el nombre del objeto principal
            const nameMatch = linea.match(/\["name"\]\s*=\s*"([^"]+)"/);
            if (nameMatch && !recetaActual) {
                recetaActual = nameMatch[1].trim();
                continue;
            }

            // Capturar materiales (Buscamos patrones comunes de ingredientes en Lua)
            if (linea.includes('["name"]') && (linea.includes('["count"]') || linea.includes('["num"]'))) {
                const matNameMatch = linea.match(/\["name"\]\s*=\s*"([^"]+)"/);
                const matCountMatch = linea.match(/(?:\["count"\]|\["num"\])\s*=\s*(\d+)/);
                
                if (matNameMatch && matCountMatch) {
                    materialesActuales.push(`• ${matCountMatch[1]}x ${matNameMatch[1]}`);
                }
            }
        }
    }

    // Guardar la última receta procesada
    if (recetaActual) {
        const llave = normalizarTexto(recetaActual);
        if (llave) {
            RECETAS_DB[llave] = {
                nombreOriginal: recetaActual,
                materiales: materialesActuales.length > 0 ? materialesActuales.join("\n") : "• _Materiales no especificados._"
            };
        }
    }

    console.log(`[Parser] Procesamiento finalizado. Recetas indexadas: ${Object.keys(RECETAS_DB).length}`);
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('¡Bot Activo!'));

client.on('message_create', async (msg) => {
    // 1. PRIMERO REVISAMOS SI ES EL ARCHIVO LUA (Antes de validar si lleva "!")
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

    // 2. LUEGO PROCESAMOS LOS COMANDOS QUE EMPIECEN CON "!"
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

client.initialize();
