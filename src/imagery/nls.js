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
    // 25-inch / 1:2,500 scale (very detailed)
    'os_25inch_scotland_1': {
        url: 'https://mapseries-tilesets.s3.amazonaws.com/25_inch/scotland_1/{z}/{x}/{y}.png',
        maxZoom: 18,
        name: 'OS 25-inch Scotland 1st ed 1855-1882'
    },
    'os_25inch_scotland_2': {
        url: 'https://mapseries-tilesets.s3.amazonaws.com/25_inch/scotland_2/{z}/{x}/{y}.png',
        maxZoom: 18,
        name: 'OS 25-inch Scotland 2nd ed 1892-1905'
    },
    // 6-inch / 1:10,560 scale
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
    // 1-inch scale
    'os_1inch_first': {
        url: 'https://mapseries-tilesets.s3.amazonaws.com/os/one-inch-first-bart38/{z}/{x}/{y}.png',
        maxZoom: 16,
        name: 'OS One-Inch First Edition'
    },
    'os_1inch_2nd': {
        url: 'https://mapseries-tilesets.s3.amazonaws.com/1inch_2nd_ed/{z}/{x}/{y}.png',
        maxZoom: 16,
        name: 'OS One-Inch Second Edition'
    },
    // Military/GSGS maps
    'gsgs_3906': {
        url: 'https://mapseries-tilesets.s3.amazonaws.com/gsgs3906/{z}/{x}/{y}.png',
        maxZoom: 16,
        name: 'GSGS 3906 1:25,000 1940-43 (Scotland)'
    },
    // Small scale overview maps
    'os_10mile_general': {
        url: 'https://mapseries-tilesets.s3.amazonaws.com/ten_mile/general/{z}/{x}/{y}.png',
        maxZoom: 12,
        name: 'OS Ten-Mile 1:633,600 General 1955'
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
