import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

let RECETAS_DB = {};

function parsearLuaGuildCrafts(contenidoLua) {
    console.log("[Parser] Iniciando lectura del archivo GuildCrafts.lua...");
    const lineas = contenidoLua.split(/\r?\n/);
    let recetaActual = null;
    let materialesActuales = [];
    let enBloqueRecipeDB = false;

    RECETAS_DB = {};

    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i].trim();

        if (linea.includes('["_recipeDB"]') || linea.includes('["recipeDB"]')) {
            enBloqueRecipeDB = true;
            continue;
        }
        
        if (enBloqueRecipeDB && (linea.startsWith('["Jefe de Guerra') || linea.startsWith('["professions"]'))) {
            if (recetaActual) {
                RECETAS_DB[recetaActual.toLowerCase().trim()] = {
                    nombreOriginal: recetaActual,
                    materiales: materialesActuales.length > 0 ? materialesActuales.join("\n") : "• _Materiales no especificados._"
                };
            }
            enBloqueRecipeDB = false;
        }

        if (enBloqueRecipeDB) {
            if (linea.match(/^\[\d+\]\s*=\s*\{/)) {
                if (recetaActual) {
                    RECETAS_DB[recetaActual.toLowerCase().trim()] = {
                        nombreOriginal: recetaActual,
                        materiales: materialesActuales.length > 0 ? materialesActuales.join("\n") : "• _Materiales no especificados._"
                    };
                }
                recetaActual = null;
                materialesActuales = [];
                continue;
            }

            const nameMatch = linea.match(/\["name"\]\s*=\s*"([^"]+)"/);
            if (nameMatch) {
                recetaActual = nameMatch[1].trim();
                continue;
            }

            if (linea.includes('["name"]') && linea.includes('["count"]')) {
                const matNameMatch = linea.match(/\["name"\]\s*=\s*"([^"]+)"/);
                const matCountMatch = linea.match(/\["count"\]\s*=\s*(\d+)/);
                
                if (matNameMatch && matCountMatch) {
                    materialesActuales.push(`• ${matCountMatch[1]}x ${matNameMatch[1]}`);
                }
            }
        }
    }

    if (recetaActual) {
        RECETAS_DB[recetaActual.toLowerCase().trim()] = {
            nombreOriginal: recetaActual,
            materiales: materialesActuales.length > 0 ? materialesActuales.join("\n") : "• _Materiales no especificados._"
        };
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
    const texto = msg.body.toLowerCase().trim();

    if (msg.hasMedia && msg.type === 'document') {
        const media = await msg.downloadMedia();
        if (media.filename && media.filename.endsWith('.lua')) {
            try {
                const contenidoLua = Buffer.from(media.data, 'base64').toString('utf-8');
                parsearLuaGuildCrafts(contenidoLua);
                await msg.reply(`✅ *¡Base de datos cargada!* (${Object.keys(RECETAS_DB).length} recetas en español).`);
                return;
            } catch (err) {
                await msg.reply(`❌ Error: ${err.message}`);
                return;
            }
        }
    }

    if (texto === '!lista') {
        const llaves = Object.keys(RECETAS_DB);
        if (llaves.length === 0) {
            await msg.reply("⚠️ La base de datos está vacía.");
            return;
        }
        const muestra = llaves.slice(0, 30).map(k => `• ${RECETAS_DB[k].nombreOriginal}`).join("\n");
        await msg.reply(`📋 *Muestra de recetas (Primeras 30):*\n\n${muestra}`);
        return;
    }

    if (texto.startsWith('!receta ') || texto === '!mangosta') {
        let busqueda = texto.replace('!receta ', '').trim();
        if (texto === '!mangosta') busqueda = 'mangosta';

        if (Object.keys(RECETAS_DB).length === 0) {
            await msg.reply(`⚠️ La base de datos está vacía. Reenvía el archivo *GuildCrafts.lua*.`);
            return;
        }

        // Búsqueda inteligente por coincidencia parcial en español
        let encontradaKey = Object.keys(RECETAS_DB).find(k => k.includes(busqueda));

        if (encontradaKey) {
            const receta = RECETAS_DB[encontradaKey];
            let mensaje = `📜 *Receta: ${receta.nombreOriginal}* 📜\n\n`;
            mensaje += `🛠️ *Materiales:*\n${receta.materiales}\n\n`;
            mensaje += `👥 _Revisa las profesiones de la hermandad en el WoW._`;
            await msg.reply(mensaje);
        } else {
            await msg.reply(`❌ No encontré ninguna receta que contenga "${busqueda}". Intenta con otra palabra en español (ej: \`!receta plata\` o \`!receta frasco\`).`);
        }
    }
});

client.initialize();
