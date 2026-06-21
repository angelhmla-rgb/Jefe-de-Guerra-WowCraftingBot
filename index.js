import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
const { Client, LocalAuth } = pkg;

function escanearArchivoLua(lua) {
    let reporte = "📊 *REPORTES DEL ESCÁNER DE DIAGNÓSTICO*\n\n";
    
    // 1. Intentar separar el bloque global del de los jugadores usando lastUpdate
    const partes = lua.split(/\["lastUpdate"\]/);
    
    if (partes.length < 2) {
        return "❌ *Error crítico:* No se encontró la sección `['lastUpdate']` para dividir el archivo. Revisa si el formato cambió.";
    }

    const bloqueRecetas = partes[0]; 
    const bloqueJugadores = partes[1]; 

    // 2. Contar recetas en la primera mitad
    const coincidenciasRecetas = bloqueRecetas.match(/\[-?\d+\]\s*=\s*\{/g) || [];
    reporte += `📝 *Recetas detectadas en la primera mitad:* ${coincidenciasRecetas.length}\n`;

    // 3. Contar personajes en la segunda mitad
    const coincidenciasJugadores = bloqueJugadores.match(/\["([^"]+)-Dreamscythe"\]\s*=\s*\{/g) || 
                                   bloqueJugadores.match(/"([^"]+)-Dreamscythe"\s*=\s*\{/g) || [];
    reporte += `👥 *Personajes de la hermandad detectados:* ${coincidenciasJugadores.length}\n\n`;
    
    if (coincidenciasJugadores.length > 0) {
        reporte += `👤 *Muestra de los primeros 5 artesanos encontrados:*\n`;
        coincidenciasJugadores.slice(0, 5).forEach(j => {
            // Limpiar el texto para que se vea bonito
            const limpio = j.replace(/[^a-zA-Z-]/g, "");
            reporte += `• ${limpio}\n`;
        });
    } else {
        reporte += `⚠️ _No se detectaron perfiles con el sufijo "-Dreamscythe" en la segunda mitad._\n`;
    }

    return reporte;
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

// Esto asegura que te vuelva a salir el código QR en la terminal de tu servidor
client.on('qr', (qr) => {
    console.log("=== ESCANEA ESTE CÓDIGO QR CON TU WHATSAPP ===");
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('¡Bot de Diagnóstico Activo y Conectado!');
});

client.on('message_create', async (msg) => {
    if (msg.hasMedia && msg.type === 'document') {
        const media = await msg.downloadMedia();
        if (media.filename && media.filename.endsWith('.lua')) {
            try {
                const contenidoLua = Buffer.from(media.data, 'base64').toString('utf-8');
                
                // Ejecutamos el escáner y guardamos lo que descubrió
                const resultadoDiagnostico = escanearArchivoLua(contenidoLua);
                
                // El bot te responderá directamente en WhatsApp con el informe
                await msg.reply(resultadoDiagnostico);
                return;
            } catch (err) {
                await msg.reply(`❌ Error al procesar: ${err.message}`);
                return;
            }
        }
    }
});

client.initialize();
