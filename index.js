import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

function normalizarTexto(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function parsearLuaGuildCrafts(lua) {
    console.log("[Parser] Iniciando lectura secuencial corregida...");
    RECETAS_DB = {};
    
    const lineas = lua.split(/\r?\n/);
    let recetaActual = null;
    let materiales = [];
    let artesanos = [];
    
    let tempMatName = null;
    let tempMatCount = null;

    const filtrarKeywords = [
        "name", "count", "num", "crafters", "players", "recipes", "id", "profession", 
        "icon", "itemid", "itemlink", "rank", "level", "minlevel", "source", "skill", 
        "orange", "yellow", "green", "gray", "disabled", "favorite", "true", "false", "link"
    ];

    for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i].trim();

        // 1. Detectar inicio de bloque [ID] = {
        if (l.match(/^\[\d+\]\s*=\s*\{/)) {
            if (recetaActual) {
                const llave = normalizarTexto(recetaActual);
                if (llave) {
                    RECETAS_DB[llave] = {
                        nombreOriginal: recetaActual,
                        materiales: materiales.length > 0 ? materiales.join("\n") : "• _No se especificaron reactivos._",
                        artesanos: artesanos.length > 0 ? artesanos.join(", ") : "_Ningún artesano registrado._"
                    };
                }
            }
            recetaActual = null;
            materiales = [];
            artesanos = [];
            tempMatName = null;
            tempMatCount = null;
            continue;
        }

        // 2. Identificar el nombre de la receta (La primera ocurrencia de ["name"] en el bloque)
        const nameM = l.match(/\["name"\]\s*=\s*"([^"]+)"/);
        if (nameM && !recetaActual) {
            const posNombre = nameM[1].trim();
            if (!posNombre.includes('recipeDB') && !posNombre.includes('_recipeDB')) {
                recetaActual = posNombre;
            }
            continue; 
        }

        // Si ya tenemos una receta en proceso, extraemos su contenido interno
        if (recetaActual) {
            // Captura de ingredientes
            if (nameM) {
                const posibleMat = nameM[1].trim();
                if (posibleMat !== recetaActual) {
                    tempMatName = posibleMat;
                }
            }

            const matCountMatch = l.match(/(?:\["count"\]|\["num"\])\s*=\s*(\d+)/);
            if (matCountMatch) {
                tempMatCount = matCountMatch[1];
            }

            if (tempMatName && tempMatCount) {
                materiales.push(`• ${tempMatCount}x ${tempMatName}`);
                tempMatName = null;
                tempMatCount = null;
            }

            // Captura de artesanos primarios
            const playM = l.match(/\["([^"]+)"\]\s*=\s*(?:true|1)/);
            if (playM) {
                const jug = playM[1].trim();
                if (!filtrarKeywords.includes(jug.toLowerCase()) && jug !== recetaActual && isNaN(jug) && jug.length > 2) {
                    if (!artesanos.includes(jug)) artesanos.push(jug);
                }
            }

            // Captura de artesanos secundarios (texto plano)
            const crafterSimpleM = l.match(/"([^"]+)"\s*,?/);
            if (crafterSimpleM && l.includes('"') && !l.includes('=')) {
                const jugSuelto = crafterSimpleM[1].trim();
                if (jugSuelto.length > 2 && isNaN(jugSuelto) && !filtrarKeywords.includes(jugSuelto.toLowerCase()) && jugSuelto !== recetaActual) {
                    if (!artesanos.includes(jugSuelto)) artesanos.push(jugSuelto);
                }
            }
        }
    }

    // Guardar el último elemento al salir del ciclo
    if (recetaActual) {
        const llave = normalizarTexto(recetaActual);
        if (llave) {
            RECETAS_DB[llave] = {
                nombreOriginal: recetaActual,
                materiales: materiales.length > 0 ? materiales.join("\n") : "• _No se especificaron reactivos._",
                artesanos: artesanos.length > 0 ? artesanos.join(", ") : "_Ningún artesano registrado._"
            };
        }
    }

    console.log(`[Parser] Indexación completada. Total: ${Object.keys(RECETAS_DB).length} elementos.`);
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
