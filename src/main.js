/**
 * Manchester Historical GIS - Main Entry Point
 */

// Cesium imports
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// App modules
import { createViewer } from './viewer.js';
import { initUI } from './ui/controls.js';
import { loadAllLayers } from './layers/index.js';

// Styles
import './styles.css';

// Initialize the application
async function init() {
    console.log('Initializing Manchester Historical GIS...');

    // Create Cesium viewer
    const viewer = createViewer('cesiumContainer');

    // Load all data layers
    const layers = await loadAllLayers(viewer);

    // Initialize UI controls
    initUI(viewer, layers);

    console.log('Application initialized');
}

// Start the app
init().catch(err => {
    console.error('Failed to initialize:', err);
});
