/**
 * Historical GIS - Main Entry Point
 */

import { App } from './app.js';

async function main() {
    const configUrl = '/data/projects/example/config.json';

    const response = await fetch(configUrl);
    if (!response.ok) {
        console.error(`Could not load config: ${configUrl}`);
        return;
    }

    const config = await response.json();
    const app = new App('cesiumContainer', 'controls');
    await app.init(config);
}

main().catch(err => console.error('Failed to initialize:', err));
