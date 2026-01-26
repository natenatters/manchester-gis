/**
 * URL Template Imagery Provider
 * For NLS historic maps, local tiles, and other XYZ tile services
 */

import * as Cesium from 'cesium';

/**
 * Create a URL template imagery provider
 * @param {Object} config
 * @param {string} config.url - URL template with {x}, {y}, {z} placeholders
 * @param {string} [config.credit] - Attribution text
 * @param {number} [config.minimumLevel=0] - Minimum zoom level
 * @param {number} [config.maximumLevel=18] - Maximum zoom level
 * @returns {Cesium.UrlTemplateImageryProvider}
 */
export function createUrlTemplateProvider(config) {
    return new Cesium.UrlTemplateImageryProvider({
        url: config.url,
        credit: config.credit,
        minimumLevel: config.minimumLevel || 0,
        maximumLevel: config.maximumLevel || 18
    });
}
