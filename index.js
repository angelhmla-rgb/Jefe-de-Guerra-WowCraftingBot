import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

function normalizarTexto(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function parsearLuaGuildCrafts(lua) {
    console.log("[Parser] Iniciando extracción relacional corregida...");
    RECETAS_DB = {};
    const baseDatos = {};

    // Lista de palabras clave que NO son nombres de jugadores
    const listaNegra = [
        "name", "count", "num", "crafters", "players", "recipes", "members",
        "id", "profession", "icon", "mats", "reagents", "itemid", "recipedb",
        "itemlink", "rank", "level", "minlevel", "source", "skill", "orange",
        "yellow", "green", "gray", "disabled", "favorite", "search", "filter"
    ];

    // 1. PRIMERA PASADA: Capturar IDs y nombres de recetas
    const regexNombres = /\[(\d+)\]\s*=\s*\{\s*(?:\["name"\]\s*=\s*"([^"]+)"|["']([^"']+)["'])/g;
    let match;
    while ((match = regexNombres.exec(lua)) !== null) {
        const id = match[1];
        const nombre = (match[2] || match[3]).trim();
        if (nombre && nombre.length > 2 && !nombre.startsWith("UI_") && !nombre.includes('Config')) {
            baseDatos[id] = { nombre: nombre, materiales: [], artesanos: [] };
        }
    }

    // 2. SEGUNDA PASADA: Mapear materiales y aislar artesanos de verdad
    const bloques = lua.split(/\[(\d+)\]\s*=\s*\{/);
    for (let i = 1; i < bloques.length; i += 2) {
        const id = bloques[i];
        const cuerpo = bloques[i + 1];
        if (!cuerpo || !baseDatos[id]) continue;

        const lineas = cuerpo.split('\n');
        let tempMatName = null;

        for (let j = 0; j < lineas.length; j++) {
            const l = lineas[j].trim();
            if (l.startsWith('}') && !l.includes('{')) break; 

            // --- Extracción de Materiales ---
            const matNameM = l.match(/\["name"\]\s*=\s*"([^"]+)"/);
            if (matNameM && matNameM[1].trim() !== baseDatos[id].nombre) {
                tempMatName = matNameM[1].trim();
            }

            const matCountM = l.match(/(?:\["count"\]|\["num"\])\s*=\s*(\d+)/);
            if (matCountM && tempMatName) {
                baseDatos[id].materiales.push(`• ${matCountM[1]}x ${tempMatName}`);
                tempMatName = null;
            }

            // --- Extracción de Artesanos ---
            const playerM = l.match(/\["([^"]+)"\]\s*=\s*(?:true|1)/);
            if (playerM) {
                const jug = playerM[1].trim();

                if (!listaNegra.includes(jug.toLowerCase()) && jug !== baseDatos[id].nombre && isNaN(jug)) {
                    if (!baseDatos[id].artesanos.includes(jug)) {
                        baseDatos[id].artesanos.push(jug);
                    }
                }
            }
        }
    }

    // 3. CONSOLIDAR EN EL DICCIONARIO DEL BOT
    Object.keys(baseDatos).forEach(id => {
        const datos = baseDatos[id];
        const llave = normalizarTexto(datos.nombre);
        if (llave) {
            if (RECETAS_DB[llave]) {
                // Fusionar materiales si el registro actual los tiene y el anterior no
                if (datos.materiales.length > 0 && (RECETAS_DB[llave].materiales.length === 0 || RECETAS_DB[llave].materiales.includes("No se especificaron"))) {
                    RECETAS_DB[llave].materiales = datos.materiales.join("\n");
                }
                
                // Fusionar artesanos aplicando la lista negra estrictamente para limpiar residuos
                const viejosArtesanos = RECETAS_DB[llave].artesanos.split(", ")
                    .map(x => x.trim())
                    .filter(x => x && !x.includes("Ningún artesano") && !listaNegra.includes(x.toLowerCase()));
                
                datos.artesanos.forEach(a => {
                    if (!listaNegra.includes(a.toLowerCase()) && !viejosArtesanos.includes(a)) {
                        viejosArtesanos.push(a);
                    }
                });
                
                RECETAS_DB[llave].artesanos = viejosArtesanos.join(", ");
            } else {
                // Filtrar la lista de artesanos antes del primer guardado
                const artesanosLimpios = datos.artesanos.filter(a => !listaNegra.includes(a.toLowerCase()));
                RECETAS_DB[llave] = {
                    nombreOriginal: datos.nombre,
                    materiales: datos.materiales.length > 0 ? datos.materiales.join("\n") : "",
                    artesanos: artesanosLimpios.length > 0 ? artesanosLimpios.join(", ") : ""
                };
            }
        }
    });

    // Post-procesar para rellenar campos vacíos con estética limpia
    Object.keys(RECETAS_DB).forEach(k => {
        if (!RECETAS_DB[k].materiales || RECETAS_DB[k].materiales.trim() === "") {
            RECETAS_DB[k].materiales = "• _No se especificaron reactivos._";
        }
        if (!RECETAS_DB[k].artesanos || RECETAS_DB[k].artesanos.trim() === "") {
            RECETAS_DB[k].artesanos = "_Ningún artesano registrado._";
        }
    });

    console.log(`[Parser] Indexación completada. Total único: ${Object.keys(RECETAS_DB).length} elementos.`);
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

    if (llavesEncontradas.length === 0) {
        await msg.reply(`❌ No encontré ningún elemento que coincida con "${textoOriginal}".`);
        return;
    }

    if (llavesEncontradas.length === 1) {
        const receta = RECETAS_DB[llavesEncontradas[0]];
        let mensaje = `📜 *Receta: ${receta.nombreOriginal}* 📜\n\n🛠️ *Materiales:*\n${receta.materiales}\n\n👥 *Artesanos:*\n${receta.artesanos}`;
        await msg.reply(mensaje);
        return;
    }

    let mCoincide = `🔍 Encontré varias opciones para "${textoOriginal}":\n\n`;
    llavesEncontradas.slice(0, 20).forEach(k => { 
        mCoincide += `• \`!${RECETAS_DB[k].nombreOriginal}\`\n`; 
    });
    if (llavesEncontradas.length > 20) {
        mCoincide += `\n_...y ${llavesEncontradas.length - 20} opciones más._`;
    }
    await msg.reply(mCoincide);
});

client.initialize();
