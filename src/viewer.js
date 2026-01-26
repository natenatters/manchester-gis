/**
 * Cesium Viewer Setup
 */

import * as Cesium from 'cesium';
import { ImageryManager } from './imagery/manager.js';

// Fallback center if no config provided
const DEFAULT_CENTER = {
    lon: 0,
    lat: 51.5,
    height: 100000
};

/**
 * Create and configure the Cesium viewer
 * @param {string} containerId - DOM element ID for the viewer
 * @param {Object} config - Project configuration with center coordinates and imagery
 * @returns {{ viewer: Cesium.Viewer, imageryManager: ImageryManager }}
 */
export function createViewer(containerId, config = {}) {
    const center = config.center || DEFAULT_CENTER;

    // Initialize viewer with reduced GPU usage
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

    // Disable expensive effects
    viewer.scene.fog.enabled = false;
    viewer.scene.globe.showGroundAtmosphere = false;
    viewer.scene.skyAtmosphere.show = false;
    viewer.scene.highDynamicRange = false;
    viewer.infoBox.frame.sandbox = 'allow-same-origin allow-popups allow-forms allow-scripts';

    // Set up temporal imagery manager
    const imageryManager = new ImageryManager(viewer);
    imageryManager.load(config.imagery);

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

    return { viewer, imageryManager };
}

/**
 * Get the base imagery layer
 * @param {Cesium.Viewer} viewer
 * @returns {Cesium.ImageryLayer|null}
 */
export function getBaseLayer(viewer) {
    return viewer.imageryLayers.get(0);
}
