import axios from 'axios';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

const CLIENT_ID = process.env.BLIZZARD_CLIENT_ID;
const CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET;
const REGION = process.env.BLIZZARD_REGION || 'us'; 
const LOCALE = 'es_MX';

// 1. FUNCIÓN: Obtener Token
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
        console.error('Error en Token:', error.message);
        throw error;
    }
}

// 2. FUNCIÓN: Consultar API de Blizzard con namespace dinámico
async function queryBlizzardItem(itemId, namespace, token) {
    const itemUrl = `https://${REGION}.api.blizzard.com/data/wow/item/${itemId}`;
    const response = await axios.get(itemUrl, {
        params: { 
            namespace: namespace, 
            locale: LOCALE, 
            access_token: token 
        }
    });
    return response.data;
}

// 3. FUNCIÓN PRINCIPAL: Buscar con re-intento automático (Retail -> Classic)
async function fetchItemById(itemId) {
    try {
        const token = await getBlizzardAccessToken();
        let itemData = null;
        let selectedNamespace = `static-${REGION}`; // Intentar Retail primero

        try {
            console.log(`[Bot] Buscando ID ${itemId} en Retail (${selectedNamespace})...`);
            itemData = await queryBlizzardItem(itemId, selectedNamespace, token);
        } catch (retailError) {
            // Si da 404, cambiamos el chip e intentamos con la base de datos Classic
            if (retailError.response?.status === 404) {
                selectedNamespace = `static-classic-${REGION}`;
                console.log(`[Bot] No está en Retail. Reintentando ID ${itemId} en Classic (${selectedNamespace})...`);
                itemData = await queryBlizzardItem(itemId, selectedNamespace, token);
            } else {
                throw retailError;
            }
        }
        
        const item = itemData;
        let mensaje = `📦 *Objeto Encontrado en Blizzard* 📦\n\n`;
        mensaje += `• *Nombre:* ${item.name}\n`;
        mensaje += `• *ID del Objeto:* ${item.id}\n`;
        if (item.quality?.name) mensaje += `• *Calidad:* ${item.quality.name}\n`;
        if (item.item_class?.name) mensaje += `• *Categoría:* ${item.item_class.name}\n`;
        if (item.required_level) mensaje += `• *Nivel Requerido:* ${item.required_level}\n`;
        
        return mensaje;

    } catch (error) {
        if (error.response?.status === 404) {
            return `❌ El ID \`${itemId}\` no se encontró ni en la base de datos de Retail ni en la de Classic de Blizzard.`;
        }
        console.error('Error al consultar objeto:', error.message);
        return `❌ Hubo un error al procesar el objeto con Blizzard.`;
    }
}

// 4. INICIALIZAR BOT
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('qr', (qr) => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('¡Bot conectado y listo!'));

// ESCUCHAR COMANDOS
client.on('message_create', async (msg) => {
    if (msg.body.startsWith('!objeto ') || msg.body.startsWith('!receta ')) {
        const itemId = msg.body.split(' ')[1]?.trim();
        
        if (!itemId || !/^\d+$/.test(itemId)) {
            return msg.reply('⚠️ Por favor ingresa un ID numérico válido. Ejemplo: `!objeto 22861`');
        }

        const resultado = await fetchItemById(itemId);
        await msg.reply(resultado);
    }
});

client.initialize();
