/**
 * OpenStreetMap Imagery Provider
 */

import * as Cesium from 'cesium';

/**
 * Create an OpenStreetMap imagery provider
 * @param {Object} config
 * @param {string} [config.url] - Tile server URL (default: OSM)
 * @param {string} [config.credit] - Attribution text
 * @returns {Cesium.OpenStreetMapImageryProvider}
 */
export function createOsmProvider(config = {}) {
    return new Cesium.OpenStreetMapImageryProvider({
        url: config.url || 'https://a.tile.openstreetmap.org/',
        credit: config.credit
    });
}
