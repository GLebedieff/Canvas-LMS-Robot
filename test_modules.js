const axios = require('axios');
require('dotenv').config();

const canvas = axios.create({
    baseURL: 'https://pucpr.instructure.com/api/v1',
    headers: { Authorization: `Bearer ${process.env.CANVAS_TOKEN}` }
});

async function run() {
    try {
        const modulesRes = await canvas.get('/courses/64033/modules?include[]=items');
        const modules = modulesRes.data;
        const fileItems = modules.flatMap(m => m.items).filter(i => i.type === 'File');
        if (fileItems.length > 0) {
            console.log("Found file in module:", fileItems[0].title);
            console.log("File URL:", fileItems[0].url);
            // Try fetching the file object directly using the API URL provided in the module item
            const fileRes = await canvas.get(fileItems[0].url.replace('https://pucpr.instructure.com/api/v1', ''));
            console.log("File details:", fileRes.data.display_name, fileRes.data.url.substring(0, 50) + "...");
        } else {
            console.log("No file items found in modules.");
        }
    } catch(err) {
        console.error("Error:", err.message);
    }
}
run();
