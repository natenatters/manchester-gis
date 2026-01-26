/**
 * Web Map Tile Service (WMTS) Imagery Provider
 */

import * as Cesium from 'cesium';

/**
 * Create a WMTS imagery provider
 * @param {Object} config
 * @param {string} config.url - WMTS service URL
 * @param {string} config.layer - Layer identifier
 * @param {string} [config.style='default'] - Style name
 * @param {string} config.tileMatrixSetID - Tile matrix set identifier
 * @param {string} [config.credit] - Attribution text
 * @param {number} [config.maximumLevel] - Maximum zoom level
 * @returns {Cesium.WebMapTileServiceImageryProvider}
 */
export function createWmtsProvider(config) {
    return new Cesium.WebMapTileServiceImageryProvider({
        url: config.url,
        layer: config.layer,
        style: config.style || 'default',
        tileMatrixSetID: config.tileMatrixSetID,
        credit: config.credit,
        maximumLevel: config.maximumLevel
    });
}
