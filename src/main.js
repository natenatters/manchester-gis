/**
 * Historical GIS - Main Entry Point
 */

// Cesium imports
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Cesium Ion Access Token (enables terrain, OSM Buildings, Google 3D Tiles)
const cesiumToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
if (cesiumToken) {
    Cesium.Ion.defaultAccessToken = cesiumToken;
} else {
    console.warn('VITE_CESIUM_ION_TOKEN not set - some features may be unavailable');
}

// App modules
import { createViewer } from './viewer.js';
import { initUI } from './ui/controls.js';
import { loadAllLayers } from './layers/index.js';

// Styles
import './styles.css';

// Default project path (can be overridden via URL param)
const DEFAULT_PROJECT = '/data/projects/example';

/**
 * Load project configuration
 */
async function loadProjectConfig(projectPath) {
    const response = await fetch(`${projectPath}/config.json`);
    if (!response.ok) {
        throw new Error(`Could not load project config from ${projectPath}`);
    }
    return response.json();
}

// Initialize the application
async function init() {
    console.time('⏱️ TOTAL init');

    // Get project path from URL or use default
    const urlParams = new URLSearchParams(window.location.search);
    const projectPath = urlParams.get('project') || DEFAULT_PROJECT;

    // Load project config
    console.time('⏱️ loadProjectConfig');
    const config = await loadProjectConfig(projectPath);
    console.timeEnd('⏱️ loadProjectConfig');
    console.log(`Initializing ${config.name}...`);

    // Create Cesium viewer with unified layer manager
    console.time('⏱️ createViewer');
    const { viewer, layerManager } = await createViewer('cesiumContainer', config);
    console.timeEnd('⏱️ createViewer');

    // Load all data layers (entities)
    console.time('⏱️ loadAllLayers');
    const dataLayers = await loadAllLayers(viewer, projectPath, config, layerManager);
    console.timeEnd('⏱️ loadAllLayers');

    // Initialize UI controls
    console.time('⏱️ initUI');
    initUI(viewer, dataLayers, config, layerManager);
    console.timeEnd('⏱️ initUI');

    // Set initial year (triggers imagery, tilesets, and entity filtering)
    console.time('⏱️ setYear');
    const { setYear } = await import('./layers/index.js');
    await setYear(dataLayers, config.defaultYear || 200, layerManager);
    console.timeEnd('⏱️ setYear');

    console.timeEnd('⏱️ TOTAL init');
    console.log('Application initialized');
}

// Start the app
init().catch(err => {
    console.error('Failed to initialize:', err);
});
