/**
 * Historical GIS - Main Entry Point
 */

import { App } from './app.js';

const app = new App();
app.init('cesiumContainer').catch(err => console.error('Failed to initialize:', err));
