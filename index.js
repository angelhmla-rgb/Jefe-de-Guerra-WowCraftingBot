import axios from 'axios';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

// Credenciales de entorno
const CLIENT_ID = process.env.BLIZZARD_CLIENT_ID;
const CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET;
const REGION = process.env.BLIZZARD_REGION || 'us'; 
const LOCALE = 'es_MX';

// 1. FUNCIÓN: Obtener Token de Blizzard
async function getBlizzardAccessToken() {
    const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
    try {
        const response = await axios.post(`https://oauth.battle.net/token`, 
            'grant_type=client_credentials', 
            {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        return response.data.access_token;
    } catch (error) {
        console.error('Error en Token de Blizzard:', error.message);
        throw error;
    }
}

// 2. FUNCIÓN PRINCIPAL: Obtener datos de la Receta por ID
async function fetchRecipeById(recipeId, token) {
    const recipeUrl = `https://${REGION}.api.blizzard.com/data/wow/recipe/${recipeId}`;
    const response = await axios.get(recipeUrl, {
        params: { namespace: `static-${REGION}`, locale: LOCALE, access_token: token }
    });
    
    const recipe = response.data;
    let mensaje = `🛠️ *Receta encontrada: ${recipe.name}* (ID: ${recipeId})\n`;
    if (recipe.description) mensaje += `_${recipe.description}_\n`;
    mensaje += `\n*Materiales Requeridos:*\n`;
    
    if (!recipe.reagents || recipe.reagents.length === 0) {
        mensaje += `• _Esta receta no requiere materiales consumibles._\n`;
    } else {
        recipe.reagents.forEach(reagent => {
            mensaje += `• ${reagent.quantity}x ${reagent.reagent.name}\n`;
        });
    }
    return mensaje;
}

// 3. FUNCIÓN: Procesador de Comandos
async function processRecipeRequest(userInput) {
    try {
        const token = await getBlizzardAccessToken();
        const cleanInput = userInput.trim();

        // CASO A: El usuario escribió un ID numérico directo
        if (/^\d+$/.test(cleanInput)) {
            return await fetchRecipeById(cleanInput, token);
        }

        // CASO B: El usuario escribió texto (Buscador flexible)
        const searchUrl = `https://${REGION}.api.blizzard.com/data/wow/search/recipe`;
        const searchResponse = await axios.get(searchUrl, {
            params: {
                namespace: `static-${REGION}`,
                locale: LOCALE,
                access_token: token,
                'name.es_MX': cleanInput,
                _page: 1,
                _pageSize: 3 // Revisamos hasta 3 opciones
            }
        });

        const results = searchResponse.data.results;
        
        if (!results || results.length === 0) {
            return `❌ No encontré recetas con "${cleanInput}".\n\n💡 *Tip:* Si la búsqueda falla por el nombre, puedes usar el ID numérico de Wowhead. Ejemplo:\n\`!receta 375743\``;
        }

        // Tomamos la primera coincidencia encontrada en la búsqueda
        const recipeId = results[0].data.id;
        return await fetchRecipeById(recipeId, token);

    } catch (error) {
        if (error.response?.status === 404) {
            return `❌ No se encontró ninguna receta con esos datos en la base de datos de WoW.`;
        }
        console.error('Error en el proceso:', error.message);
        return `❌ Hubo un error al procesar la receta con Blizzard.`;
    }
}

// 4. INICIALIZAR BOT DE WHATSAPP
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

client.on('qr', (qr) => {
    console.log('--- NUEVO CÓDIGO QR REQUERIDO ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('¡El bot de Jefe de Guerra está conectado y escuchando comandos!');
});

// ESCUCHAR COMANDOS
client.on('message_create', async (msg) => {
    if (msg.body.startsWith('!receta ')) {
        const query = msg.body.substring(8).trim();
        
        if (!query) {
            return msg.reply('⚠️ Escribe el nombre o ID de la receta. Ejemplo: `!receta 375743` o `!receta Frasco`');
        }

        console.log(`[Bot] Procesando comando para: ${query}`);
        const resultado = await processRecipeRequest(query);
        await msg.reply(resultado);
    }
});

client.initialize();
