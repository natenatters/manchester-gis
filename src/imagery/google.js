/**
 * Google Maps Imagery Provider
 * Free tile layers from Google Maps
 *
 * Layer types:
 * - 'm' = roadmap
 * - 's' = satellite
 * - 'y' = hybrid (satellite + labels)
 * - 'p' = terrain
 */

import * as Cesium from 'cesium';

/**
 * Create a Google Maps imagery provider
 * @param {Object} config
 * @param {string} [config.mapType='s'] - Map type: 'm' (road), 's' (satellite), 'y' (hybrid), 'p' (terrain)
 * @param {string} [config.credit] - Attribution text
 * @param {number} [config.maximumLevel=20] - Maximum zoom level
 * @returns {Cesium.UrlTemplateImageryProvider}
 */
export function createGoogleProvider(config = {}) {
    const mapType = config.mapType || 's';

    return new Cesium.UrlTemplateImageryProvider({
        url: `https://mt1.google.com/vt/lyrs=${mapType}&x={x}&y={y}&z={z}`,
        credit: config.credit || 'Google Maps',
        maximumLevel: config.maximumLevel || 20,
        tileWidth: 256,
        tileHeight: 256
    });
}
