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
    // Prepend base URL for absolute paths
    const url = config.url.startsWith('/')
        ? `${import.meta.env.BASE_URL}${config.url.slice(1)}`
        : config.url;

    return new Cesium.UrlTemplateImageryProvider({
        url,
        credit: config.credit,
        minimumLevel: config.minimumLevel || 0,
        maximumLevel: config.maximumLevel || 18
    });
}
