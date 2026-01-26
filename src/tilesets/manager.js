/**
 * Temporal Tileset Manager
 * Manages 3D tilesets (buildings, photogrammetry) and switches visibility based on year
 */

import * as Cesium from 'cesium';

/**
 * @typedef {Object} TemporalTileset
 * @property {Cesium.Cesium3DTileset} tileset - The Cesium 3D tileset
 * @property {Object} config - Original configuration
 * @property {number} yearStart - Start year (inclusive)
 * @property {number} yearEnd - End year (inclusive)
 */

// Factory functions for different tileset types
const tilesetFactories = {
    /**
     * Google Photorealistic 3D Tiles
     */
    google_3d: async (config) => {
        return await Cesium.createGooglePhotorealistic3DTileset();
    },

    /**
     * Cesium OSM Buildings
     */
    osm_buildings: async (config) => {
        return await Cesium.createOsmBuildingsAsync();
    },

    /**
     * Custom 3D Tiles from URL
     */
    url: async (config) => {
        return await Cesium.Cesium3DTileset.fromUrl(config.url, {
            maximumScreenSpaceError: config.maximumScreenSpaceError || 16
        });
    },

    /**
     * Cesium Ion Asset
     */
    ion: async (config) => {
        return await Cesium.Cesium3DTileset.fromIonAssetId(config.assetId, {
            maximumScreenSpaceError: config.maximumScreenSpaceError || 16
        });
    }
};

/**
 * Register a custom tileset factory
 * @param {string} type - Tileset type identifier
 * @param {Function} factory - Async factory function that takes config and returns a Cesium3DTileset
 */
export function registerTilesetFactory(type, factory) {
    tilesetFactories[type] = factory;
}

/**
 * Manages temporal 3D tilesets for a Cesium viewer
 */
export class TilesetManager {
    /**
     * @param {Cesium.Viewer} viewer - Cesium viewer instance
     */
    constructor(viewer) {
        this.viewer = viewer;
        /** @type {TemporalTileset[]} */
        this.tilesets = [];
        this.currentYear = null;
        this.activeTileset = null;
    }

    /**
     * Load tileset configuration (array of tileset configs)
     * @param {Object[]} tilesetConfigs - Array of tileset configurations
     */
    async load(tilesetConfigs) {
        if (!tilesetConfigs || !Array.isArray(tilesetConfigs)) {
            return;
        }

        for (const config of tilesetConfigs) {
            const factory = tilesetFactories[config.type];
            if (!factory) {
                console.warn(`Unknown tileset type: ${config.type}`);
                continue;
            }

            try {
                const tileset = await factory(config);
                tileset.show = false; // Hidden by default

                this.viewer.scene.primitives.add(tileset);

                this.tilesets.push({
                    tileset,
                    config,
                    yearStart: config.yearStart ?? -Infinity,
                    yearEnd: config.yearEnd ?? Infinity
                });

                console.log(`Loaded tileset: ${config.name || config.type}`);
            } catch (err) {
                console.warn(`Could not load tileset ${config.type}:`, err.message);
            }
        }
    }

    /**
     * Find tilesets that match a given year
     * @param {number} year
     * @returns {TemporalTileset[]}
     */
    getTilesetsForYear(year) {
        return this.tilesets.filter(t =>
            year >= t.yearStart && year <= t.yearEnd
        );
    }

    /**
     * Set the current year and update tileset visibility
     * @param {number} year
     * @returns {TemporalTileset|null} The active tileset
     */
    setYear(year) {
        this.currentYear = year;

        // Find matching tilesets
        const matching = this.getTilesetsForYear(year);

        // Hide all tilesets
        for (const t of this.tilesets) {
            t.tileset.show = false;
        }

        // Show the first matching tileset (highest priority)
        if (matching.length > 0) {
            this.activeTileset = matching[0];
            this.activeTileset.tileset.show = true;
        } else {
            this.activeTileset = null;
        }

        // Adjust terrain exaggeration - reduce when 3D tilesets are shown
        // (they have real elevation data, don't want to double-exaggerate)
        if (this.baseExaggeration !== undefined) {
            this.viewer.scene.verticalExaggeration = this.activeTileset ? 1.0 : this.baseExaggeration;
        }

        return this.activeTileset;
    }

    /**
     * Store the base terrain exaggeration (called by viewer setup)
     * @param {number} exaggeration
     */
    setBaseExaggeration(exaggeration) {
        this.baseExaggeration = exaggeration;
    }

    /**
     * Get the currently active tileset
     * @returns {TemporalTileset|null}
     */
    getActiveTileset() {
        return this.activeTileset;
    }

    /**
     * Get tileset info for UI display
     * @returns {Object[]}
     */
    getTilesetInfo() {
        return this.tilesets.map((t, i) => ({
            index: i,
            name: t.config.name || t.config.type,
            type: t.config.type,
            yearStart: t.yearStart === -Infinity ? null : t.yearStart,
            yearEnd: t.yearEnd === Infinity ? null : t.yearEnd,
            isActive: t === this.activeTileset
        }));
    }
}
