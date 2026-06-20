import axios from 'axios';

// 1. Cargamos las credenciales seguras
const CLIENT_ID = process.env.BLIZZARD_CLIENT_ID;
const CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET;
const REGION = process.env.BLIZZARD_REGION || 'us'; 
const LOCALE = 'es_MX'; // O 'es_ES' según prefieras el idioma del juego

// Función para obtener el Token de acceso de Blizzard (Dura 24 horas)
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
        console.error('Error obteniendo el token de Blizzard:', error.response?.data || error.message);
        throw error;
    }
}

// Función para buscar los materiales de una receta usando su ID
async function getRecipeMaterials(recipeId) {
    try {
        const token = await getBlizzardAccessToken();
        
        // Consultamos el endpoint de datos de juego para recetas
        const url = `https://${REGION}.api.blizzard.com/data/wow/recipe/${recipeId}`;
        const response = await axios.get(url, {
            params: {
                namespace: `static-${REGION}`,
                locale: LOCALE,
                access_token: token
            }
        });

        const recipe = response.data;
        console.log(`\n=== Receta: ${recipe.name} ===`);
        console.log(`Descripción: ${recipe.description || 'Sin descripción.'}`);
        console.log('\nMateriales requeridos:');
        
        // Iteramos los reactivos/materiales del crafteo
        recipe.reagents.forEach(reagent => {
            console.log(`- ${reagent.quantity}x ${reagent.reagent.name} (ID: ${reagent.reagent.id})`);
        });

    } catch (error) {
        console.error('Error al obtener la receta:', error.response?.data || error.message);
    }
}

// PRUEBA: Buscaremos una receta conocida (por ejemplo, ID 40574)
// Puedes cambiar este ID por el del objeto de profesión que quieras probar
getRecipeMaterials(40574);
