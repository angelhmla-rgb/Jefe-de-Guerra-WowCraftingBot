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

// 2. FUNCIÓN: Buscar receta por NOMBRE y luego traer materiales
async function getRecipeByNameText(recipeName) {
    try {
        const token = await getBlizzardAccessToken();
        const cleanName = recipeName.toLowerCase().trim();

        const searchUrl = `https://${REGION}.api.blizzard.com/data/wow/search/recipe`;
        const searchResponse = await axios.get(searchUrl, {
            params: {
                namespace: `static-${REGION}`,
                locale: LOCALE,
                access_token: token,
                'name.es_MX': cleanName,
                _page: 1,
                _pageSize: 1
            }
        });

        const results = searchResponse.data.results;
        
        if (!results || results.length === 0) {
            return `❌ No encontré ninguna receta que coincida exactamente con "${recipeName}" en Blizzard. Revisa que esté bien escrita.`;
        }

        const recipeId = results[0].data.id;
        const recipeUrl = `https://${REGION}.api.blizzard.com/data/wow/recipe/${recipeId}`;
        const recipeResponse = await axios.get(recipeUrl, {
            params: { namespace: `static-${REGION}`, locale: LOCALE, access_token: token }
        });

        const recipe = recipeResponse.data;
        let mensaje = `🛠️ *Receta encontrada: ${recipe.name}*\n`;
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

    } catch (error) {
        console.error('Error al consultar Blizzard:', error.response?.data || error.message);
        return `❌ Hubo un error al procesar la receta con Blizzard.`;
    }
}

// 3. INICIALIZAR BOT DE WHATSAPP
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

// ESCUCHAR TODOS LOS MENSAJES
client.on('message_create', async (msg) => {
    if (msg.body.startsWith('!receta ')) {
        const query = msg.body.substring(8).trim();
        
        if (!query) {
            return msg.reply('⚠️ Escribe el nombre de la receta. Ejemplo: `!receta Frasco de poder aislado`');
        }

        console.log(`[Bot] Buscando en Blizzard: ${query}`);
        
        const resultado = await getRecipeByNameText(query);
        await msg.reply(resultado);
    }
});

client.initialize();
