import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

function normalizarTexto(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function parsearLuaGuildCrafts(lua) {
    console.log("[Parser] Iniciando lectura de recetas...");
    RECETAS_DB = {};
    
    const lineas = lua.split(/\r?\n/);
    
    let recetaActual = null;
    let materiales = [];
    
    let dentroDeReagents = false;
    let dentroDeUnReagent = false;
    let tempMatName = null;
    let tempMatCount = null;

    for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i].trim();

        // 1. Detectar inicio de una receta principal: [ID] = { o [-ID] = {
        if (l.match(/^\[-?\d+\]\s*=\s*\{/) && !l.includes('_recipeDB') && !l.includes('GuildCraftsDB')) {
            // Guardar la receta anterior antes de iniciar la nueva
            if (recetaActual) {
                const llave = normalizarTexto(recetaActual);
                if (llave) {
                    RECETAS_DB[llave] = {
                        nombreOriginal: recetaActual,
                        materiales: materiales.length > 0 ? materiales.join("\n") : "• _No se especificaron reactivos._"
                    };
                }
            }
            // Resetear contenedores
            recetaActual = null;
            materiales = [];
            dentroDeReagents = false;
            dentroDeUnReagent = false;
            tempMatName = null;
            tempMatCount = null;
            continue;
        }

        // 2. Rastrear si estamos dentro del sub-bloque de reactivos
        if (l.startsWith('["reagents"]') || l.startsWith('"reagents"')) {
            dentroDeReagents = true;
            continue;
        }
        if (dentroDeReagents && l.startsWith('{')) {
            dentroDeUnReagent = true;
            continue;
        }
        if (dentroDeUnReagent && (l.startsWith('},') || l.startsWith('}'))) {
            // Al cerrar un ingrediente, guardamos lo recolectado
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

        // 3. Extraer los nombres de forma selectiva
        const nameM = l.match(/\["name"\]\s*=\s*"([^"]+)"/) || l.match(/"name"\s*=\s*"([^"]+)"/);
        if (nameM) {
            const valorNombre = nameM[1].trim();
            if (dentroDeUnReagent) {
                tempMatName = valorNombre; // Es un material
            } else if (!recetaActual) {
                recetaActual = valorNombre; // Es el nombre de la receta principal
            }
            continue;
        }

        // 4. Extraer las cantidades de los materiales
        const countM = l.match(/\["count"\]\s*=\s*(\d+)/) || l.match(/"count"\s*=\s*(\d+)/);
        if (countM && dentroDeUnReagent) {
            tempMatCount = countM[1];
            continue;
        }
    }

    // Guardar la última del archivo
    if (recetaActual) {
        const llave = normalizarTexto(recetaActual);
        if (llave) {
            RECETAS_DB[llave] = {
                nombreOriginal: recetaActual,
                materiales: materiales.length > 0 ? materiales.join("\n") : "• _No se especificaron reactivos._"
            };
        }
    }

    console.log(`[Parser] Indexación exitosa. Total: ${Object.keys(RECETAS_DB).length} recetas.`);
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
                await msg.reply(`✅ *¡Base de datos cargada!* (${Object.keys(RECETAS_DB).length} recetas listas).`);
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
        let mensaje = `📜 *Receta: ${receta.nombreOriginal}* 📜\n\n🛠️ *Materiales:*\n${receta.materiales}`;
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
