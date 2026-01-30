/**
 * Single Tile Imagery Provider
 * For single georeferenced images (e.g., scanned historic maps)
 */

import * as Cesium from 'cesium';

/**
 * Create a single tile imagery provider
 * @param {Object} config
 * @param {string} config.url - URL to the image file
 * @param {Object} [config.bounds] - Geographic bounds for the image
 * @param {number} config.bounds.west - Western longitude
 * @param {number} config.bounds.south - Southern latitude
 * @param {number} config.bounds.east - Eastern longitude
 * @param {number} config.bounds.north - Northern latitude
 * @param {number} [config.tileWidth=256] - Tile width in pixels
 * @param {number} [config.tileHeight=256] - Tile height in pixels
 * @param {string} [config.credit] - Attribution text
 * @returns {Cesium.SingleTileImageryProvider}
 */
export function createSingleTileProvider(config) {
    // Prepend base URL for absolute paths
    const url = config.url.startsWith('/')
        ? `${import.meta.env.BASE_URL}${config.url.slice(1)}`
        : config.url;

    return new Cesium.SingleTileImageryProvider({
        url,
        rectangle: config.bounds ? Cesium.Rectangle.fromDegrees(
            config.bounds.west,
            config.bounds.south,
            config.bounds.east,
            config.bounds.north
        ) : undefined,
        tileWidth: config.tileWidth || 256,
        tileHeight: config.tileHeight || 256,
        credit: config.credit
    });
}
