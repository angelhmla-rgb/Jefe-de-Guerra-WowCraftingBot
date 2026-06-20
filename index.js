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

// 2. FUNCIÓN PRINCIPAL: Buscar Objeto usando la cabecera estándar Bearer
async function fetchItemById(itemId) {
    try {
        const token = await getBlizzardAccessToken();
        
        // La API de Blizzard prefiere el token en los headers en vez de los params para evitar bloqueos
        const itemUrl = `https://${REGION}.api.blizzard.com/data/wow/item/${itemId}?namespace=static-${REGION}&locale=${LOCALE}`;
        
        console.log(`[Bot] Intentando conectar con Blizzard para el ID: ${itemId}`);
        
        const response = await axios.get(itemUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const item = response.data;
        let mensaje = `📦 *Objeto Encontrado en WoW* 📦\n\n`;
        mensaje += `• *Nombre:* ${item.name}\n`;
        mensaje += `• *ID:* ${item.id}\n`;
        if (item.quality?.name) mensaje += `• *Calidad:* ${item.quality.name}\n`;
        if (item.item_class?.name) mensaje += `• *Clase:* ${item.item_class.name}\n`;
        if (item.required_level) mensaje += `• *Nivel Mínimo:* ${item.required_level}\n`;
        
        return mensaje;

    } catch (error) {
        console.error('Error al consultar objeto:', error.response?.data || error.message);
        return `❌ No se pudo obtener el ID \`${itemId}\`. Asegúrate de que el ID existe en Retail o intenta con otro.`;
    }
}

// 3. INICIALIZAR BOT
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
            return msg.reply('⚠️ Por favor ingresa un ID numérico válido.');
        }

        const resultado = await fetchItemById(itemId);
        await msg.reply(resultado);
    }
});

client.initialize();
