/**
 * Cesium Viewer Setup
 */

import * as Cesium from 'cesium';
import { TemporalLayerManager } from './layers/TemporalLayerManager.js';

// Fallback center if no config provided
const DEFAULT_CENTER = {
    lon: 0,
    lat: 51.5,
    height: 100000
};

/**
 * Create and configure the Cesium viewer
 * @param {string} containerId - DOM element ID for the viewer
 * @param {Object} config - Project configuration
 * @returns {Promise<{ viewer: Cesium.Viewer, layerManager: TemporalLayerManager }>}
 */
export async function createViewer(containerId, config = {}) {
    const center = config.center || DEFAULT_CENTER;

    // Initialize viewer with reduced GPU usage
    console.time('  ⏱️ new Cesium.Viewer');
    const viewer = new Cesium.Viewer(containerId, {
        timeline: false,
        animation: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: true,
        sceneModePicker: true,
        navigationHelpButton: false,
        imageryProvider: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        targetFrameRate: 30,
        useBrowserRecommendedResolution: true,
        shadows: false,
        terrainShadows: Cesium.ShadowMode.DISABLED
    });
    console.timeEnd('  ⏱️ new Cesium.Viewer');

    // Disable expensive effects and keep it simple
    viewer.scene.fog.enabled = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.skyAtmosphere.show = false;
    viewer.scene.highDynamicRange = false;
    viewer.scene.skyBox.show = false;  // No stars, just black
    viewer.scene.sun.show = false;
    viewer.scene.moon.show = false;
    viewer.infoBox.frame.sandbox = 'allow-same-origin allow-popups allow-forms allow-scripts';

    // Set up unified temporal layer manager
    console.time('  ⏱️ layerManager.load');
    const layerManager = new TemporalLayerManager(viewer);
    layerManager.load(config.layers);
    console.timeEnd('  ⏱️ layerManager.load');

    // Set up terrain (LIDAR/elevation) if configured
    if (config.terrain?.enabled) {
        console.time('  ⏱️ terrain setup');
        try {
            viewer.scene.setTerrain(Cesium.Terrain.fromWorldTerrain());

            const exaggeration = config.terrain.exaggeration || 1.0;
            viewer.scene.verticalExaggeration = exaggeration;
            layerManager.setBaseExaggeration(exaggeration);

            console.log(`Cesium World Terrain enabled (${exaggeration}x exaggeration)`);
        } catch (err) {
            console.warn('Could not load terrain:', err.message);
        }
        console.timeEnd('  ⏱️ terrain setup');
    }

    // Set camera over project center
    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
            center.lon,
            center.lat,
            center.height
        ),
        orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-90),
            roll: 0
        }
    });

    return { viewer, layerManager };
}

/**
 * Get the base imagery layer
 * @param {Cesium.Viewer} viewer
 * @returns {Cesium.ImageryLayer|null}
 */
export function getBaseLayer(viewer) {
    return viewer.imageryLayers.get(0);
}
