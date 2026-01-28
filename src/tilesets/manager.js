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
        return await Cesium.createGooglePhotorealistic3DTileset({
            onlyUsingWithGoogleGeocoder: true
        });
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
 * Supports lazy loading - tilesets only load when their year range is needed
 */
export class TilesetManager {
    /**
     * @param {Cesium.Viewer} viewer - Cesium viewer instance
     */
    constructor(viewer) {
        this.viewer = viewer;
        /** @type {TemporalTileset[]} */
        this.tilesets = [];
        /** @type {Object[]} Configs pending lazy load */
        this.pendingConfigs = [];
        this.currentYear = null;
        this.activeTileset = null;
        this.loadingPromise = null;
    }

    /**
     * Register tileset configurations (doesn't load them yet - lazy loading)
     * @param {Object[]} tilesetConfigs - Array of tileset configurations
     * @param {number} [initialYear] - If provided, only load tilesets needed for this year
     */
    async load(tilesetConfigs, initialYear = null) {
        if (!tilesetConfigs || !Array.isArray(tilesetConfigs)) {
            return;
        }

        // Store all configs for lazy loading
        for (const config of tilesetConfigs) {
            const factory = tilesetFactories[config.type];
            if (!factory) {
                console.warn(`Unknown tileset type: ${config.type}`);
                continue;
            }

            this.pendingConfigs.push({
                config,
                factory,
                yearStart: config.yearStart ?? -Infinity,
                yearEnd: config.yearEnd ?? Infinity,
                loaded: false
            });
        }

        console.log(`Registered ${this.pendingConfigs.length} tilesets for lazy loading`);
    }

    /**
     * Load a specific pending tileset
     * @param {Object} pending - Pending config object
     */
    async _loadTileset(pending) {
        if (pending.loaded) return;

        console.time(`  ⏱️ lazy load: ${pending.config.name || pending.config.type}`);
        try {
            const tileset = await pending.factory(pending.config);
            tileset.show = false;

            this.viewer.scene.primitives.add(tileset);

            this.tilesets.push({
                tileset,
                config: pending.config,
                yearStart: pending.yearStart,
                yearEnd: pending.yearEnd
            });

            pending.loaded = true;
            console.timeEnd(`  ⏱️ lazy load: ${pending.config.name || pending.config.type}`);
            console.log(`Loaded tileset: ${pending.config.name || pending.config.type}`);
        } catch (err) {
            pending.loaded = true; // Mark as loaded to prevent retry
            console.warn(`Could not load tileset ${pending.config.type}:`, err.message);
        }
    }

    /**
     * Find tilesets that match a given year (only loaded ones)
     * @param {number} year
     * @returns {TemporalTileset[]}
     */
    getTilesetsForYear(year) {
        return this.tilesets.filter(t =>
            year >= t.yearStart && year <= t.yearEnd
        );
    }

    /**
     * Find pending configs that match a given year
     * @param {number} year
     * @returns {Object[]}
     */
    _getPendingForYear(year) {
        return this.pendingConfigs.filter(p =>
            !p.loaded && year >= p.yearStart && year <= p.yearEnd
        );
    }

    /**
     * Set the current year and update tileset visibility
     * Lazy-loads tilesets if needed
     * @param {number} year
     * @returns {Promise<TemporalTileset|null>} The active tileset
     */
    async setYear(year) {
        this.currentYear = year;

        // Check if we need to lazy-load any tilesets for this year
        const pendingForYear = this._getPendingForYear(year);
        if (pendingForYear.length > 0) {
            // Load all needed tilesets
            await Promise.all(pendingForYear.map(p => this._loadTileset(p)));
        }

        // Find matching tilesets (now including newly loaded ones)
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
