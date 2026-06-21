import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

function normalizarTexto(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function parsearLuaGuildCrafts(lua) {
    console.log("[Parser] Iniciando extracción por bloques globales...");
    RECETAS_DB = {};
    const baseDatos = {};

    // 1. Primera pasada: Encontrar todas las recetas y sus nombres por ID
    const regexRecetas = /\[(\d+)\]\s*=\s*\{[^}]*\["name"\]\s*=\s*"([^"]+)"/g;
    let match;
    while ((match = regexRecetas.exec(lua)) !== null) {
        const id = match[1];
        const nombre = match[2].trim();
        if (!nombre.includes('recipeDB')) {
            baseDatos[id] = { nombre, materiales: [], artesanos: [] };
        }
    }

    // 2. Segunda pasada: Dividir el archivo por bloques de ID para sacar materiales y artesanos de forma segura
    const bloques = lua.split(/\[(\d+)\]\s*=\s*\{/);
    for (let i = 1; i < bloques.length; i += 2) {
        const id = bloques[i];
        const cuerpo = bloques[i + 1];
        if (!cuerpo || !baseDatos[id]) continue;

        // Extraer reactivos dentro de las líneas de este bloque
        const lineas = cuerpo.split('\n');
        let tempMatName = null;

        for (let j = 0; j < lineas.length; j++) {
            const l = lineas[j].trim();
            if (l.startsWith('}') && !l.includes('{')) break; // Fin del sub-bloque

            const matNameM = l.match(/\["name"\]\s*=\s*"([^"]+)"/);
            if (matNameM && matNameM[1].trim() !== baseDatos[id].nombre) {
                tempMatName = matNameM[1].trim();
            }

            const matCountM = l.match(/(?:\["count"\]|\["num"\])\s*=\s*(\d+)/);
            if (matCountM && tempMatName) {
                baseDatos[id].materiales.push(`• ${matCountM[1]}x ${tempMatName}`);
                tempMatName = null;
            }

            // Extraer artesanos registrados (Estilo: ["Nombre"] = true o 1)
            const playerM = l.match(/\["([^"]+)"\]\s*=\s*(?:true|1)/);
            if (playerM) {
                const jug = playerM[1].trim();
                const filtrar = ["name","count","num","crafters","players","recipes","id","profession","icon","mats"];
                if (!filtrar.includes(jug.toLowerCase()) && jug !== baseDatos[id].nombre) {
                    if (!baseDatos[id].artesanos.includes(jug)) baseDatos[id].artesanos.push(jug);
                }
            }
        }
    }

    // 3. Consolidar en la base de datos de búsqueda del bot
    Object.keys(baseDatos).forEach(id => {
        const datos = baseDatos[id];
        const llave = normalizarTexto(datos.nombre);
        if (llave) {
            RECETAS_DB[llave] = {
                nombreOriginal: datos.nombre,
                materiales: datos.materiales.length > 0 ? datos.materiales.join("\n") : "• _No se especificaron reactivos en este registro._",
                artesanos: datos.artesanos.length > 0 ? datos.artesanos.join(", ") : "_Ningún artesano registrado en la hermandad todavía._"
            };
        }
    });

    console.log(`[Parser] Indexación completada con éxito. Total: ${Object.keys(RECETAS_DB).length} elementos.`);
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
