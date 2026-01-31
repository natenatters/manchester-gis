/**
 * Historical GIS - Main Entry Point
 */

import 'cesium/Build/Cesium/Widgets/widgets.css';
import { createApp } from 'vue';
import App from './App.vue';

async function main() {
    const base = import.meta.env.BASE_URL;
    const configUrl = `${base}data/projects/example/project.json`;

    const response = await fetch(configUrl);
    if (!response.ok) {
        console.error(`Could not load config: ${configUrl}`);
        return;
    }

    const config = await response.json();

    const app = createApp(App, { config });
    app.mount('#app');
}

main().catch(err => console.error('Failed to initialize:', err));
