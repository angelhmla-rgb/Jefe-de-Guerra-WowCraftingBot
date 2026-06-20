import axios from 'axios';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

const CLIENT_ID = process.env.BLIZZARD_CLIENT_ID;
const CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET;
const REGION = process.env.BLIZZARD_REGION || 'us'; 

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

// 2. FUNCIÓN: Consultar API de Blizzard
async function queryBlizzardItem(itemId, namespace, locale, token) {
    const itemUrl = `https://${REGION}.api.blizzard.com/data/wow/item/${itemId}`;
    const response = await axios.get(itemUrl, {
        params: { 
            namespace: namespace, 
            locale: locale, 
            access_token: token 
        }
    });
    return response.data;
}

// 3. FUNCIÓN PRINCIPAL: Buscar con re-intentos de Namespace e Idioma
async function fetchItemById(itemId) {
    try {
        const token = await getBlizzardAccessToken();
        let item = null;

        // Lista de combinaciones lógicas a intentar antes de rendirse
        const intentos = [
            { ns: `static-${REGION}`, lang: 'es_MX', label: 'Retail (Español)' },
            { ns: `static-classic-${REGION}`, lang: 'es_MX', label: 'Classic (Español)' },
            { ns: `static-${REGION}`, lang: 'en_US', label: 'Retail (Inglés)' },
            { ns: `static-classic-${REGION}`, lang: 'en_US', label: 'Classic (Inglés)' }
        ];

        for (const intento of intentos) {
            try {
                console.log(`[Bot] Probando ID ${itemId} en ${intento.label}...`);
                item = await queryBlizzardItem(itemId, intento.ns, intento.lang, token);
                if (item) break; // Si encontramos datos, rompemos el ciclo
            } catch (err) {
                // Si es un 404, permitimos que continúe el bucle al siguiente intento
                if (err.response?.status !== 404) throw err;
            }
        }

        if (!item) {
            return `❌ El ID \`${itemId}\` no se pudo encontrar en ninguna combinación de la base de datos de Blizzard (Retail/Classic/Español/Inglés).`;
        }
        
        let mensaje = `📦 *Objeto Encontrado en Blizzard* 📦\n\n`;
        mensaje += `• *Nombre:* ${item.name}\n`;
        mensaje += `• *ID del Objeto:* ${item.id}\n`;
        if (item.quality?.name) mensaje += `• *Calidad:* ${item.quality.name}\n`;
        if (item.item_class?.name) mensaje += `• *Categoría:* ${item.item_class.name}\n`;
        if (item.required_level) mensaje += `• *Nivel Requerido:* ${item.required_level}\n`;
        
        return mensaje;

    } catch (error) {
        console.error('Error crítico al consultar objeto:', error.message);
        return `❌ Hubo un error inesperado al procesar el objeto con Blizzard.`;
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
