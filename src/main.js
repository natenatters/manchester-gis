/**
 * Historical GIS - Main Entry Point
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
    // Get project path from URL or use default
    const urlParams = new URLSearchParams(window.location.search);
    const projectPath = urlParams.get('project') || DEFAULT_PROJECT;

    // Load project config
    const config = await loadProjectConfig(projectPath);
    console.log(`Initializing ${config.name}...`);

    // Create Cesium viewer with project config
    const { viewer, imageryManager } = createViewer('cesiumContainer', config);

    // Load all data layers
    const layers = await loadAllLayers(viewer, projectPath, config, imageryManager);

    // Initialize UI controls
    initUI(viewer, layers, config, imageryManager);

    // Set initial year (triggers imagery and entity filtering)
    const { setYear } = await import('./layers/index.js');
    setYear(layers, config.defaultYear || 200, imageryManager);

    console.log('Application initialized');
}

// Start the app
init().catch(err => {
    console.error('Failed to initialize:', err);
});
