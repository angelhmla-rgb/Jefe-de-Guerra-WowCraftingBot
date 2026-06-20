import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

// Variables de memoria globales
let RECETAS_DB = {};

// Parser ultra-compatible línea por línea para GuildCrafts.lua
function parsearLuaGuildCrafts(contenidoLua) {
    console.log("[Parser] Iniciando lectura del archivo GuildCrafts.lua...");
    
    const lineas = contenidoLua.split(/\r?\n/);
    let recetasEncontradas = 0;
    
    let enBloqueRecipeDB = false;
    let recetaActual = null;
    let materialesActuales = [];

    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i].trim();

        // Detectar inicio y fin del bloque de recetas principales
        if (linea.includes('["_recipeDB"]') || linea.includes('["recipeDB"]')) {
            enBloqueRecipeDB = true;
            continue;
        }
        
        // Si salimos del bloque principal (por ejemplo, entra a la sección de la guild)
        if (enBloqueRecipeDB && (linea.startsWith('["Jefe de Guerra') || linea.startsWith('["professions"]'))) {
            // Guardamos la última si quedó pendiente
            if (recetaActual) {
                RECETAS_DB[recetaActual.toLowerCase()] = {
                    nombreOriginal: recetaActual,
                    materiales: materialesActuales.length > 0 ? materialesActuales.join("\n") : "• _Materiales no especificados._"
                };
            }
            enBloqueRecipeDB = false;
        }

        if (enBloqueRecipeDB) {
            // Detectar el inicio de una nueva receta: [ID] = {
            if (linea.match(/^\[\d+\]\s*=\s*\{/)) {
                // Si ya había una receta procesándose, la guardamos antes de iniciar la nueva
                if (recetaActual) {
                    RECETAS_DB[recetaActual.toLowerCase()] = {
                        nombreOriginal: recetaActual,
                        materiales: materialesActuales.length > 0 ? materialesActuales.join("\n") : "• _Materiales no especificados._"
                    };
                }
                recetaActual = null;
                materialesActuales = [];
                continue;
            }

            // Buscar el nombre de la receta: ["name"] = "Nombre de la Receta"
            const nameMatch = linea.match(/\["name"\]\s*=\s*"([^"]+)"/);
            if (nameMatch) {
                recetaActual = nameMatch[1].trim();
                recetasEncontradas++;
                continue;
            }

            // Buscar materiales/reactivos
            // Este patrón captura tanto la cantidad (count) como el nombre del material en la misma línea
            if (linea.includes('["name"]') && linea.includes('["count"]')) {
                const matNameMatch = linea.match(/\["name"\]\s*=\s*"([^"]+)"/);
                const matCountMatch = linea.match(/\["count"\]\s*=\s*(\d+)/);
                
                if (matNameMatch && matCountMatch) {
                    materialesActuales.push(`• ${matCountMatch[1]}x ${matNameMatch[1]}`);
                }
            }
        }
    }

    // Guardar la última receta del bucle si existía
    if (recetaActual) {
        RECETAS_DB[recetaActual.toLowerCase()] = {
            nombreOriginal: recetaActual,
            materiales: materialesActuales.length > 0 ? materialesActuales.join("\n") : "• _Materiales no especificados._"
        };
    }

    console.log(`[Parser] Procesamiento finalizado. Recetas indexadas de forma única: ${Object.keys(RECETAS_DB).length}`);
}

// Inicializar cliente de WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));

client.on('ready', () => {
    console.log('¡El Bot de Jefe de Guerra con soporte para Addons está activo!');
});

// Escuchar mensajes y comandos
client.on('message_create', async (msg) => {
    const texto = msg.body.toLowerCase().trim();

    // 1. Capturar el archivo cuando se envía por chat
    if (msg.hasMedia && msg.type === 'document') {
        const media = await msg.downloadMedia();
        if (media.filename && media.filename.endsWith('.lua')) {
            try {
                const contenidoLua = Buffer.from(media.data, 'base64').toString('utf-8');
                parsearLuaGuildCrafts(contenidoLua);
                
                const total = Object.keys(RECETAS_DB).length;
                await msg.reply(`✅ *¡Base de datos cargada!*\nSe han sincronizado exitosamente *${total} recetas* desde tu GuildCrafts.lua.`);
                return;
            } catch (err) {
                await msg.reply(`❌ Error al procesar el archivo LUA: ${err.message}`);
                return;
            }
        }
    }

    // 2. Comandos de consulta
    if (texto.startsWith('!receta ') || texto === '!mangosta') {
        let busqueda = texto.replace('!receta ', '').trim();
        if (texto === '!mangosta') busqueda = 'mangosta';

        if (Object.keys(RECETAS_DB).length === 0) {
            await msg.reply(`⚠️ La base de datos está vacía. Por favor, vuelve a enviar el archivo *GuildCrafts.lua* a este chat para cargar las recetas.`);
            return;
        }

        // Buscar coincidencia parcial (ej. si buscan "mangosta" encuentra "elixir de mangosta")
        let encontradaKey = Object.keys(RECETAS_DB).find(k => k.includes(busqueda));

        if (encontradaKey) {
            const receta = RECETAS_DB[encontradaKey];
            let mensaje = `📜 *Receta encontrada: ${receta.nombreOriginal}* 📜\n\n`;
            mensaje += `🛠️ *Materiales Requeridos:*\n${receta.materiales}\n\n`;
            mensaje += `👥 _Revisa el canal de profesiones en el juego para ver los artesanos disponibles._`;
            await msg.reply(mensaje);
        } else {
            await msg.reply(`❌ No encontré ninguna receta que coincida con "${busqueda}" en el archivo del addon.`);
        }
    }
});

client.initialize();
