/**
 * Cesium Viewer Setup
 */

import * as Cesium from 'cesium';

// Fallback center if no config provided
const DEFAULT_CENTER = {
    lon: 0,
    lat: 51.5,
    height: 100000
};

// Default imagery (OSM)
const DEFAULT_IMAGERY = {
    type: 'osm',
    url: 'https://a.tile.openstreetmap.org/',
    alpha: 0.8
};

/**
 * Create an imagery provider from config
 * Supported types:
 * - osm: OpenStreetMapImageryProvider
 * - url_template: UrlTemplateImageryProvider (for NLS, local tiles, etc.)
 * - single_tile: SingleTileImageryProvider (for single georeferenced images)
 * - wmts: WebMapTileServiceImageryProvider
 */
function createImageryProvider(imageryConfig) {
    const cfg = imageryConfig || DEFAULT_IMAGERY;

    switch (cfg.type) {
        case 'osm':
            return new Cesium.OpenStreetMapImageryProvider({
                url: cfg.url || 'https://a.tile.openstreetmap.org/',
                credit: cfg.credit
            });

        case 'url_template':
            return new Cesium.UrlTemplateImageryProvider({
                url: cfg.url,
                credit: cfg.credit,
                maximumLevel: cfg.maximumLevel || 18,
                minimumLevel: cfg.minimumLevel || 0
            });

        case 'single_tile':
            return new Cesium.SingleTileImageryProvider({
                url: cfg.url,
                rectangle: cfg.bounds ? Cesium.Rectangle.fromDegrees(
                    cfg.bounds.west, cfg.bounds.south,
                    cfg.bounds.east, cfg.bounds.north
                ) : undefined,
                credit: cfg.credit
            });

        case 'wmts':
            return new Cesium.WebMapTileServiceImageryProvider({
                url: cfg.url,
                layer: cfg.layer,
                style: cfg.style || 'default',
                tileMatrixSetID: cfg.tileMatrixSetID,
                credit: cfg.credit,
                maximumLevel: cfg.maximumLevel
            });

        default:
            console.warn(`Unknown imagery type: ${cfg.type}, falling back to OSM`);
            return new Cesium.OpenStreetMapImageryProvider({
                url: 'https://a.tile.openstreetmap.org/'
            });
    }
}

/**
 * Create and configure the Cesium viewer
 * @param {string} containerId - DOM element ID for the viewer
 * @param {Object} config - Project configuration with center coordinates and imagery
 * @returns {Cesium.Viewer} Configured viewer instance
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

    // Add base imagery layer from config
    const imageryConfig = config.imagery || DEFAULT_IMAGERY;
    const provider = createImageryProvider(imageryConfig);
    const baseLayer = viewer.imageryLayers.addImageryProvider(provider);
    baseLayer.alpha = imageryConfig.alpha !== undefined ? imageryConfig.alpha : 0.8;

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

    return viewer;
}

/**
 * Get the base imagery layer
 * @param {Cesium.Viewer} viewer
 * @returns {Cesium.ImageryLayer|null}
 */
export function getBaseLayer(viewer) {
    return viewer.imageryLayers.get(0);
}
