/**
 * National Library of Scotland (NLS) Imagery Provider
 * Free historical OS map tilesets from NLS S3 buckets
 *
 * Known layers:
 * - 'os_6inch_first' - OS 6-inch County Series 1842-1882 (Scotland only)
 * - 'os_10k_natgrid' - OS 1:10,560 National Grid Maps, 1940s-1960s (Great Britain)
 * - 'os_1inch_first' - OS One-Inch First Edition (Bartholomew)
 * - 'os_1inch_2nd' - OS One-Inch Second Edition
 *
 * @see https://maps.nls.uk/guides/georeferencing/layers-list/
 */

import * as Cesium from 'cesium';

// Known NLS tileset URLs
const NLS_LAYERS = {
    'os_6inch_first': {
        url: 'https://mapseries-tilesets.s3.amazonaws.com/os/6inchfirst/{z}/{x}/{y}.png',
        maxZoom: 16,
        name: 'OS 6-inch County Series 1842-1882'
    },
    'os_10k_natgrid': {
        url: 'https://mapseries-tilesets.s3.amazonaws.com/os/britain10knatgrid/{z}/{x}/{y}.png',
        maxZoom: 16,
        name: 'OS 1:10,560 National Grid 1940s-1960s'
    },
    'os_1inch_first': {
        url: 'https://mapseries-tilesets.s3.amazonaws.com/os/one-inch-first-bart38/{z}/{x}/{y}.png',
        maxZoom: 16,
        name: 'OS One-Inch First Edition'
    },
    'os_1inch_2nd': {
        url: 'https://mapseries-tilesets.s3.amazonaws.com/1inch_2nd_ed/{z}/{x}/{y}.png',
        maxZoom: 16,
        name: 'OS One-Inch Second Edition'
    }
};

/**
 * Create an NLS imagery provider
 * @param {Object} config
 * @param {string} config.layer - Layer ID from NLS_LAYERS, or 'custom'
 * @param {string} [config.url] - Custom tile URL (if layer='custom')
 * @param {number} [config.maximumLevel] - Maximum zoom level
 * @param {string} [config.credit] - Attribution text
 * @returns {Cesium.UrlTemplateImageryProvider}
 */
export function createNlsProvider(config) {
    const layerInfo = NLS_LAYERS[config.layer];

    const url = config.url || layerInfo?.url;
    if (!url) {
        throw new Error(`Unknown NLS layer: ${config.layer}. Use one of: ${Object.keys(NLS_LAYERS).join(', ')}`);
    }

    return new Cesium.UrlTemplateImageryProvider({
        url,
        credit: config.credit || layerInfo?.name || 'National Library of Scotland',
        maximumLevel: config.maximumLevel || layerInfo?.maxZoom || 16,
        tileWidth: 256,
        tileHeight: 256
    });
}

/**
 * Get list of available NLS layers
 * @returns {Object}
 */
export function getNlsLayers() {
    return NLS_LAYERS;
}
