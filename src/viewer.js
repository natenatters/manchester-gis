/**
 * Cesium Viewer Setup
 */

import * as Cesium from 'cesium';

// Greater Manchester bounding box center
const MANCHESTER_CENTER = {
    lon: -2.24,
    lat: 53.48,
    height: 80000  // Initial camera height in meters
};

/**
 * Create and configure the Cesium viewer
 * @param {string} containerId - DOM element ID for the viewer
 * @returns {Cesium.Viewer} Configured viewer instance
 */
export function createViewer(containerId) {
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

    // Add OpenStreetMap base layer
    const osmLayer = viewer.imageryLayers.addImageryProvider(
        new Cesium.OpenStreetMapImageryProvider({
            url: 'https://a.tile.openstreetmap.org/'
        })
    );
    osmLayer.alpha = 0.8;

    // Set camera over Manchester
    viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(
            MANCHESTER_CENTER.lon,
            MANCHESTER_CENTER.lat,
            MANCHESTER_CENTER.height
        ),
        orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-90),
            roll: 0
        }
    });

    return viewer;
}

/**
 * Get the OSM layer for toggling visibility
 * @param {Cesium.Viewer} viewer
 * @returns {Cesium.ImageryLayer|null}
 */
export function getOsmLayer(viewer) {
    return viewer.imageryLayers.get(0);
}
