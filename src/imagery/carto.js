/**
 * CartoDB/Carto Basemap Imagery Provider
 * Free, fast, minimal basemaps
 *
 * Styles:
 * - 'light_all' = Positron (light gray, minimal)
 * - 'dark_all' = Dark Matter (dark, good for bright markers)
 * - 'light_nolabels' = Positron without labels
 * - 'dark_nolabels' = Dark Matter without labels
 * - 'voyager' = Colorful, more detail
 */

import * as Cesium from 'cesium';

/**
 * Create a CartoDB imagery provider
 * @param {Object} config
 * @param {string} [config.style='light_all'] - Map style
 * @param {string} [config.credit] - Attribution text
 * @param {number} [config.maximumLevel=18] - Maximum zoom level
 * @returns {Cesium.UrlTemplateImageryProvider}
 */
export function createCartoProvider(config = {}) {
    const style = config.style || 'light_all';

    return new Cesium.UrlTemplateImageryProvider({
        url: `https://basemaps.cartocdn.com/${style}/{z}/{x}/{y}.png`,
        credit: config.credit || 'CartoDB',
        maximumLevel: config.maximumLevel || 18,
        tileWidth: 256,
        tileHeight: 256
    });
}
