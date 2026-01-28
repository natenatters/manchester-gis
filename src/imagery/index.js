/**
 * Imagery Providers
 * Factory for creating Cesium imagery providers from configuration
 */

import { createOsmProvider } from './osm.js';
import { createUrlTemplateProvider } from './urlTemplate.js';
import { createSingleTileProvider } from './singleTile.js';
import { createWmtsProvider } from './wmts.js';
import { createAllmapsProvider } from './allmaps.js';
import { createGoogleProvider } from './google.js';
import { createNlsProvider } from './nls.js';
import { createCartoProvider } from './carto.js';

// Default imagery configuration
export const DEFAULT_IMAGERY = {
    type: 'osm',
    url: 'https://a.tile.openstreetmap.org/',
    alpha: 0.8
};

// Registry of provider factories by type
const providers = {
    osm: createOsmProvider,
    url_template: createUrlTemplateProvider,
    single_tile: createSingleTileProvider,
    wmts: createWmtsProvider,
    allmaps: createAllmapsProvider,
    google: createGoogleProvider,
    nls: createNlsProvider,
    carto: createCartoProvider
};

/**
 * Register a custom imagery provider factory
 * @param {string} type - Provider type identifier
 * @param {Function} factory - Factory function that takes config and returns an ImageryProvider
 */
export function registerImageryProvider(type, factory) {
    providers[type] = factory;
}

/**
 * Create an imagery provider from configuration
 * @param {Object} config - Provider configuration
 * @param {string} config.type - Provider type (osm, url_template, single_tile, wmts, allmaps)
 * @returns {Cesium.ImageryProvider}
 */
export function createImageryProvider(config) {
    const cfg = config || DEFAULT_IMAGERY;
    const factory = providers[cfg.type];

    if (factory) {
        return factory(cfg);
    }

    console.warn(`Unknown imagery type: ${cfg.type}, falling back to OSM`);
    return createOsmProvider({});
}

// Re-export individual providers for direct use
export { createOsmProvider } from './osm.js';
export { createUrlTemplateProvider } from './urlTemplate.js';
export { createSingleTileProvider } from './singleTile.js';
export { createWmtsProvider } from './wmts.js';
export { createAllmapsProvider } from './allmaps.js';
export { createGoogleProvider } from './google.js';
export { createNlsProvider, getNlsLayers } from './nls.js';
export { createCartoProvider } from './carto.js';
export { ImageryManager } from './manager.js';
