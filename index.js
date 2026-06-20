import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

function normalizarTexto(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function parsearLuaGuildCrafts(lua) {
    console.log("[Parser] Mapeando GuildCrafts...");
    RECETAS_DB = {};
    const mapaIdANombre = {};
    const regexNombres = /\[(\d+)\]\s*=\s*(?:\{\s*\["name"\]\s*=\s*"([^"]+)"|["']([^"']+)["'])/g;
    let m;
    while ((m = regexNombres.exec(lua)) !== null) {
        const id = m[1];
        const nom = m[2] || m[3];
        if (nom && !nom.includes('recipeDB')) mapaIdANombre[id] = nom.trim();
    }

    const mapaMateriales = {};
    const mapaArtesanos = {};
    Object.keys(mapaIdANombre).forEach(id => {
        mapaMateriales[id] = [];
        mapaArtesanos[id] = [];
    });

    const bloques = lua.split(/\[(\d+)\]\s*=\s*\{/);
    for (let i = 1; i < bloques.length; i += 2) {
        const id = bloques[i];
        const cuerpo = bloques[i + 1];
        if (!cuerpo) continue;

        const lineas = cuerpo.split('\n');
        let tempMat = null;
        for (let j = 0; j < lineas.length; j++) {
            const l = lineas[j];
            const nameM = l.match(/\["name"\]\s*=\s*"([^"]+)"/);
            if (nameM) tempMat = nameM[1].trim();

            const countM = l.match(/(?:\["count"\]|\["num"\])\s*=\s*(\d+)/);
            if (countM && tempMat) {
                if (mapaIdANombre[id] !== tempMat && mapaMateriales[id]) {
                    mapaMateriales[id].push(`• ${countM[1]}x ${tempMat}`);
                }
                tempMat = null;
            }

            const playM = l.match(/\["([^"]+)"\]\s*=\s*(?:true|1)/);
            if (playM) {
                const jug = playM[1].trim();
                const filtrar = ["name","count","num","crafters","players","recipes","id","profession","icon"];
                if (!filtrar.includes(jug.toLowerCase()) && jug !== mapaIdANombre[id] && mapaArtesanos[id]) {
                    if (!mapaArtesanos[id].includes(jug)) mapaArtesanos[id].push(jug);
                }
            }
        }
    }

    Object.keys(mapaIdANombre).forEach(id => {
        const nomOrig = mapaIdANombre[id];
        const llave = normalizarTexto(nomOrig);
        if (llave) {
            const mats = mapaMateriales[id] || [];
            const arts = mapaArtesanos[id] || [];
            RECETAS_DB[llave] = {
                nombreOriginal: nomOrig,
                materiales: mats.length > 0 ? mats.join("\n") : "• _No se encontraron reactivos._",
                artesanos: arts.length > 0 ? arts.join(", ") : "_Ningún artesano registrado._"
            };
        }
    });
    console.log(`[Parser] Total: ${Object.keys(RECETAS_DB).length}`);
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
                await msg.reply(`✅ *¡Base de datos cargada!* (${Object.keys(RECETAS_DB).length} elementos).`);
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
