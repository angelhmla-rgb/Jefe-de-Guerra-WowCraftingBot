import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

function normalizarTexto(t) {
    return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, "").trim();
}

function parsearLuaGuildCrafts(lua) {
    console.log("[Parser] Iniciando mapeo indexado por IDs...");
    RECETAS_DB = {};

    const baseDatos = {};
    const lineas = lua.split(/\r?\n/);

    let idActual = null;
    let modoSeccion = "buscar"; // buscar, materiales, crafters

    // PASADA ÚNICA: Escaneo e interpretación estructural por líneas
    for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i].trim();
        if (!l) continue;

        // Detectar en qué sección global del addon estamos parados
        if (l.includes('["reagents"]') || l.includes('["revent"]') || l.includes('["mat"]')) {
            modoSeccion = "materiales";
        } else if (l.includes('["crafters"]') || l.includes('["players"]') || l.includes('["members"]')) {
            modoSeccion = "crafters";
        }

        // Detectar si la línea abre un ID de objeto de WoW, ej: [22849] = {
        const idMatch = l.match(/^\[(\d+)\]\s*=\s*\{/);
        if (idMatch) {
            idActual = idMatch[1];
            if (!baseDatos[idActual]) {
                baseDatos[idActual] = { nombre: null, materiales: [], artesanos: [] };
            }
            continue;
        }

        // Si se cierra un bloque numérico
        if (l.startsWith('},') || l.startsWith('}')) {
            idActual = null;
            continue;
        }

        // 1. Capturar el nombre si tenemos un ID activo
        if (idActual) {
            const nameMatch = l.match(/\["name"\]\s*=\s*"([^"]+)"/);
            if (nameMatch) {
                const nombreLimpio = nameMatch[1].trim();
                if (!nombreLimpio.includes('recipeDB')) {
                    baseDatos[idActual].nombre = nombreLimpio;
                }
                continue;
            }

            // 2. Si estamos dentro de un ID y vemos un nombre secundario con cantidad (Material)
            if (l.includes('["name"]') && (l.includes('["count"]') || l.includes('["num"]'))) {
                const mName = l.match(/\["name"\]\s*=\s*"([^"]+)"/);
                const mCount = l.match(/(?:\["count"\]|\["num"\])\s*=\s*(\d+)/);
                if (mName && mCount && baseDatos[idActual].nombre !== mName[1].trim()) {
                    baseDatos[idActual].materiales.push(`• ${mCount[1]}x ${mName[1].trim()}`);
                }
                continue;
            }

            // 3. Capturar artesanos asignados al ID activo (Ej: ["Juan"] = true)
            const playerMatch = l.match(/\["([^"]+)"\]\s*=\s*(?:true|1)/);
            if (playerMatch) {
                const jugador = playerMatch[1].trim();
                const filtrar = ["name","count","num","crafters","players","recipes","id","profession","icon","mats"];
                if (!filtrar.includes(jugador.toLowerCase()) && jugador !== baseDatos[idActual].nombre) {
                    if (!baseDatos[idActual].artesanos.includes(jugador)) {
                        baseDatos[idActual].artesanos.push(jugador);
                    }
                }
                continue;
            }

            // Captura de nombres sueltos entre comillas (Ej: "Pedro",)
            const sueltoMatch = l.match(/^"([^"]+)"\s*,?/);
            if (sueltoMatch && (modoSeccion === "crafters" || l.length < 30)) {
                const posibleJugador = sueltoMatch[1].trim();
                const filtrar = ["name","count","num","crafters","players","recipes","id","profession","icon"];
                if (posibleJugador.length > 2 && isNaN(posibleJugador) && !filtrar.includes(posibleJugador.toLowerCase())) {
                    if (!baseDatos[idActual].artesanos.includes(posibleJugador)) {
                        baseDatos[idActual].artesanos.push(posibleJugador);
                    }
                }
            }
        }
    }

    // Convertir todo nuestro mapa de IDs indexados a la base de datos de consulta del Bot
    Object.keys(baseDatos).forEach(id => {
        const datos = baseDatos[id];
        if (datos.nombre) {
            const llave = normalizarTexto(datos.nombre);
            RECETAS_DB[llave] = {
                nombreOriginal: datos.nombre,
                materiales: datos.materiales.length > 0 ? datos.materiales.join("\n") : "• _No se especificaron reactivos en este registro._",
                artesanos: datos.artesanos.length > 0 ? datos.artesanos.join(", ") : "_Ningún artesano registrado en la hermandad todavía._"
            };
        }
    });

    console.log(`[Parser] Indexación finalizada. Total de elementos listos: ${Object.keys(RECETAS_DB).length}`);
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
