import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

function normalizarTexto(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function parsearLuaGuildCrafts(lua) {
    console.log("[Parser] Iniciando extracción híbrida total...");
    RECETAS_DB = {};
    const baseDatos = {};

    const bloques = lua.split(/\[(\d+)\]\s*=\s*\{/);
    
    for (let i = 1; i < bloques.length; i += 2) {
        const id = bloques[i];
        const cuerpo = bloques[i + 1];
        if (!cuerpo) continue;

        let nombreReceta = null;
        const nameMatch = cuerpo.match(/\["name"\]\s*=\s*"([^"]+)"/);
        
        if (nameMatch) {
            nombreReceta = nameMatch[1].trim();
        } else {
            const primerTextoMatch = cuerpo.match(/^\s*"([^"]+)"/);
            if (primerTextoMatch) {
                nombreReceta = primerTextoMatch[1].trim();
            }
        }

        if (!nombreReceta || nombreReceta.includes('recipeDB') || nombreReceta.includes('_recipeDB') || nombreReceta.length < 3) {
            continue;
        }

        if (!baseDatos[id]) {
            baseDatos[id] = { nombre: nombreReceta, materiales: [], artesanos: [] };
        }

        const lineas = cuerpo.split('\n');
        let tempMatName = null;

        for (let j = 0; j < lineas.length; j++) {
            const l = lineas[j].trim();
            if (l.startsWith('}') && !l.includes('{')) break;

            const matNameM = l.match(/\["name"\]\s*=\s*"([^"]+)"/);
            if (matNameM && matNameM[1].trim() !== nombreReceta) {
                tempMatName = matNameM[1].trim();
            }

            const matCountM = l.match(/(?:\["count"\]|\["num"\])\s*=\s*(\d+)/);
            if (matCountM && tempMatName) {
                baseDatos[id].materiales.push(`• ${matCountM[1]}x ${tempMatName}`);
                tempMatName = null;
            }

            const playerM = l.match(/\["([^"]+)"\]\s*=\s*(?:true|1)/);
            if (playerM) {
                const jug = playerM[1].trim();
                const filtrar = ["name","count","num","crafters","players","recipes","id","profession","icon","mats","reagents"];
                if (!filtrar.includes(jug.toLowerCase()) && jug !== nombreReceta) {
                    if (!baseDatos[id].artesanos.includes(jug)) {
                        baseDatos[id].artesanos.push(jug);
                    }
                }
            }
        }
    }

    Object.keys(baseDatos).forEach(id => {
        const datos = baseDatos[id];
        const llave = normalizarTexto(datos.nombre);
        if (llave) {
            // Si el elemento ya existe, intentamos fusionar artesanos o materiales por si el addon repite IDs
            if (RECETAS_DB[llave]) {
                if (datos.materiales.length > 0 && RECETAS_DB[llave].materiales.includes("No se especificaron")) {
                    RECETAS_DB[llave].materiales = datos.materiales.join("\n");
                }
                const viejosArtesanos = RECETAS_DB[llave].artesanos.split(", ").filter(x => !x.includes("Ningún artesano"));
                datos.artesanos.forEach(a => {
                    if (!viejosArtesanos.includes(a)) viejosArtesanos.push(a);
                });
                if (viejosArtesanos.length > 0) {
                    RECETAS_DB[llave].artesanos = viejosArtesanos.join(", ");
                }
            } else {
                RECETAS_DB[llave] = {
                    nombreOriginal: datos.nombre,
                    materiales: datos.materiales.length > 0 ? datos.materiales.join("\n") : "• _No se especificaron reactivos._",
                    artesanos: datos.artesanos.length > 0 ? datos.artesanos.join(", ") : "_Ningún artesano registrado._"
                };
            }
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
    
    // BÚSQUEDA TOLERANTE: Encuentra si contiene la palabra clave
    let llavesEncontradas = Object.keys(RECETAS_DB).filter(k => k.includes(busquedaNormalizada));

    // Si no hay coincidencias exactas ni parciales
    if (llavesEncontradas.length === 0) {
        await msg.reply(`❌ No encontré ningún elemento que coincida con "${textoOriginal}".`);
        return;
    }

    // Si hay una sola coincidencia exacta o parcial, la muestra directo
    if (llavesEncontradas.length === 1) {
        const receta = RECETAS_DB[llavesEncontradas[0]];
        let mensaje = `📜 *Receta: ${receta.nombreOriginal}* 📜\n\n🛠️ *Materiales:*\n${receta.materiales}\n\n👥 *Artesanos:*\n${receta.artesanos}`;
        await msg.reply(mensaje);
        return;
    }

    // Si hay múltiples coincidencias (Muy probable con palabras cortas como "mangosta")
    let mCoincide = `🔍 Encontré varias opciones para "${textoOriginal}":\n\n`;
    llavesEncontradas.slice(0, 20).forEach(k => { 
        mCoincide += `• \`!${RECETAS_DB[k].nombreOriginal}\`\n`; 
    });
    if (llavesEncontradas.length > 20) {
        mCoincide += `\n_...y ${llavesEncontradas.length - 20} opciones más. Sé más específico._`;
    }
    await msg.reply(mCoincide);
});

client.initialize();
