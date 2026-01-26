/**
 * Allmaps Imagery Provider
 * For georeferenced historical maps from National Library of Scotland and other sources
 * hosted via Allmaps (https://allmaps.org)
 *
 * @see https://allmaps.org
 * @see https://maps.nls.uk (source maps)
 */

import * as Cesium from 'cesium';

/**
 * Create an Allmaps imagery provider for georeferenced historical maps
 *
 * NOTE: Use the /images/ endpoint, not /maps/ (maps endpoint often returns empty tiles)
 *
 * @param {Object} config
 * @param {string} config.mapId - Allmaps map ID (e.g., '811b04a06391adb1')
 * @param {string} [config.endpoint='images'] - Allmaps endpoint ('images' or 'maps')
 * @param {Object} [config.bounds] - Geographic bounds for the map
 * @param {number} config.bounds.west - Western longitude
 * @param {number} config.bounds.south - Southern latitude
 * @param {number} config.bounds.east - Eastern longitude
 * @param {number} config.bounds.north - Northern latitude
 * @param {number} [config.maximumLevel=18] - Maximum zoom level
 * @param {string} [config.credit] - Attribution text
 * @returns {Cesium.UrlTemplateImageryProvider}
 *
 * @example
 * // 1845 OS Lancashire from NLS via Allmaps
 * createAllmapsProvider({
 *     mapId: 'a3940ebbf9b3662d',
 *     bounds: { west: -2.2955, south: 53.4565, east: -2.1655, north: 53.5095 },
 *     credit: '1845 OS Lancashire - National Library of Scotland via Allmaps'
 * })
 */
export function createAllmapsProvider(config) {
    const endpoint = config.endpoint || 'images';
    const url = `https://allmaps.xyz/${endpoint}/${config.mapId}/{z}/{x}/{y}.png`;

    const options = {
        url,
        maximumLevel: config.maximumLevel || 18,
        tileWidth: 256,
        tileHeight: 256
    };

    if (config.bounds) {
        options.rectangle = Cesium.Rectangle.fromDegrees(
            config.bounds.west,
            config.bounds.south,
            config.bounds.east,
            config.bounds.north
        );
    }

    if (config.credit) {
        options.credit = config.credit;
    }

    return new Cesium.UrlTemplateImageryProvider(options);
}
