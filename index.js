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

// 2. FUNCIÓN: Obtener texto formateado del crafteo
async function getRecipeText(recipeId) {
    try {
        const token = await getBlizzardAccessToken();
        const url = `https://${REGION}.api.blizzard.com/data/wow/recipe/${recipeId}`;
        const response = await axios.get(url, {
            params: { namespace: `static-${REGION}`, locale: LOCALE, access_token: token }
        });

        const recipe = response.data;
        let mensaje = `🛠️ *Receta WoW: ${recipe.name}*\n`;
        if (recipe.description) mensaje += `_${recipe.description}_\n`;
        mensaje += `\n*Materiales Requeridos:*\n`;
        
        recipe.reagents.forEach(reagent => {
            mensaje += `• ${reagent.quantity}x ${reagent.reagent.name}\n`;
        });

        return mensaje;
    } catch (error) {
        return `❌ No encontré la receta con ID o hubo un error en Blizzard.`;
    }
}

// 3. INICIALIZAR BOT DE WHATSAPP
// Usamos LocalAuth para que intente guardar la sesión en una carpeta local (.wwebjs_auth)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // Obligatorio para entornos como Railway
    }
});

// Mostrar el código QR en la consola/logs de Railway
client.on('qr', (qr) => {
    console.log('--- ESCANEA ESTE CÓDIGO QR EN TU WHATSAPP ---');
    qrcode.generate(qr, { small: true });
});

// Confirmación de conexión exitosa
client.on('ready', () => {
    console.log('¡El bot de Jefe de Guerra está conectado a WhatsApp!');
});

// ESCUCHAR MENSAJES DEL GRUPO
client.on('message', async (msg) => {
    // Si alguien escribe en el grupo: !receta <ID_DE_LA_RECETA>
    // Ejemplo: !receta 40574
    if (msg.body.startsWith('!receta ')) {
        const recipeId = msg.body.split(' ')[1];
        
        if (!recipeId || isNaN(recipeId)) {
            return msg.reply('⚠️ Por favor ingresa un ID numérico válido. Ejemplo: `!receta 40574`');
        }

        // Enviamos un mensaje de carga provisional
        const cargandoMsg = await msg.reply('🔍 Buscando componentes en los archivos de Blizzard...');
        
        // Obtenemos los materiales y respondemos en el chat
        const resultado = await getRecipeText(recipeId);
        await msg.reply(resultado);
    }
});

client.initialize();

