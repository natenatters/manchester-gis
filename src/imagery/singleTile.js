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
 * @param {string} [config.credit] - Attribution text
 * @returns {Cesium.SingleTileImageryProvider}
 */
export function createSingleTileProvider(config) {
    return new Cesium.SingleTileImageryProvider({
        url: config.url,
        rectangle: config.bounds ? Cesium.Rectangle.fromDegrees(
            config.bounds.west,
            config.bounds.south,
            config.bounds.east,
            config.bounds.north
        ) : undefined,
        credit: config.credit
    });
}
