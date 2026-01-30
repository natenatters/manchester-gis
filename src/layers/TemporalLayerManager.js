/**
 * Unified Temporal Layer Manager
 *
 * Handles both imagery (2D maps) and tilesets (3D buildings) in one place.
 * - Imagery: multiple can be active (stacking)
 * - Tilesets: one active at a time (exclusive), lazy-loaded
 */

import * as Cesium from 'cesium';
import { createImageryProvider } from '../imagery/index.js';
import { updateMapLayerVisibility } from './entities3D.js';

// Tileset factories
const tilesetFactories = {
    google_3d: async () => {
        return await Cesium.createGooglePhotorealistic3DTileset({
            onlyUsingWithGoogleGeocoder: true
        });
    },
    osm_buildings: async () => {
        return await Cesium.createOsmBuildingsAsync();
    },
    url: async (config) => {
        return await Cesium.Cesium3DTileset.fromUrl(config.url, {
            maximumScreenSpaceError: config.maximumScreenSpaceError || 16
        });
    },
    ion: async (config) => {
        return await Cesium.Cesium3DTileset.fromIonAssetId(config.assetId, {
            maximumScreenSpaceError: config.maximumScreenSpaceError || 16
        });
    }
};

export class TemporalLayerManager {
    constructor(viewer) {
        this.viewer = viewer;
        this.layers = [];          // All registered layer configs
        this.imageryLayers = [];   // Active Cesium ImageryLayers
        this.activeImageryConfigs = []; // Track which configs are active
        this.activeTileset = null; // Current 3D tileset (exclusive)
        this.loadedTilesets = new Map(); // Cache: config -> Cesium3DTileset
        this.currentYear = null;
        this.baseExaggeration = 1.0;
        this.entities3dDataSource = null; // For notifying buildings of map changes
    }

    /**
     * Set the entities3D data source for building visibility updates
     */
    setEntities3dDataSource(dataSource) {
        this.entities3dDataSource = dataSource;
    }

    /**
     * Load layer configurations
     * @param {Object[]} layerConfigs - Array from config.layers[]
     */
    load(layerConfigs) {
        if (!layerConfigs || !Array.isArray(layerConfigs)) return;

        for (const config of layerConfigs) {
            this.layers.push({
                config,
                kind: config.kind,
                type: config.type,
                yearStart: config.yearStart ?? -Infinity,
                yearEnd: config.yearEnd ?? Infinity
            });
        }

        console.log(`Registered ${this.layers.length} temporal layers`);
    }

    /**
     * Get layers matching a year, filtered by kind
     */
    _getMatchingLayers(year, kind = null) {
        return this.layers.filter(l =>
            year >= l.yearStart &&
            year <= l.yearEnd &&
            (kind === null || l.kind === kind)
        );
    }

    /**
     * Check if two arrays have the same elements (by reference)
     */
    _arraysEqual(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    /**
     * Set the current year - updates all layer visibility
     */
    async setYear(year) {
        console.time(`  ⏱️ setYear(${year})`);
        this.currentYear = year;

        // === IMAGERY: show ALL matching (stacking) ===
        const matchingImagery = this._getMatchingLayers(year, 'imagery');
        const matchingConfigs = matchingImagery.map(l => l.config);

        // Check if imagery layers changed
        const imageryChanged = !this._arraysEqual(matchingConfigs, this.activeImageryConfigs);

        if (imageryChanged) {
            console.log(`Imagery for year ${year}:`, matchingImagery.map(l => l.config.name));

            // Notify buildings: mark OLD layers as hidden
            if (this.entities3dDataSource) {
                for (const oldConfig of this.activeImageryConfigs) {
                    if (!matchingConfigs.includes(oldConfig)) {
                        updateMapLayerVisibility(this.entities3dDataSource, oldConfig.name, false);
                    }
                }
            }

            // Remove old imagery layers
            for (const layer of this.imageryLayers) {
                this.viewer.imageryLayers.remove(layer, false);
            }
            this.imageryLayers = [];

            // Add new imagery layers
            for (const layer of matchingImagery) {
                try {
                    const provider = createImageryProvider(layer.config);
                    const imageryLayer = this.viewer.imageryLayers.addImageryProvider(provider);
                    imageryLayer.alpha = layer.config.alpha ?? 1.0;
                    this.imageryLayers.push(imageryLayer);
                    console.log(`  Added imagery: ${layer.config.name}`);
                } catch (err) {
                    console.warn(`Could not create imagery layer ${layer.config.name}:`, err.message);
                }
            }

            // Notify buildings: mark NEW layers as visible
            if (this.entities3dDataSource) {
                for (const newConfig of matchingConfigs) {
                    if (!this.activeImageryConfigs.includes(newConfig)) {
                        updateMapLayerVisibility(this.entities3dDataSource, newConfig.name, true);
                    }
                }
            }

            this.activeImageryConfigs = matchingConfigs;
        }

        // === TILESETS: show FIRST matching (exclusive), lazy-load ===
        const matchingTileset = this._getMatchingLayers(year, 'tileset')[0];

        // Hide current tileset if different
        if (this.activeTileset && this.activeTileset !== matchingTileset) {
            const cesiumTileset = this.loadedTilesets.get(this.activeTileset.config);
            if (cesiumTileset) cesiumTileset.show = false;
        }

        // Show/load new tileset
        if (matchingTileset) {
            let cesiumTileset = this.loadedTilesets.get(matchingTileset.config);

            if (!cesiumTileset) {
                // Lazy load
                const factory = tilesetFactories[matchingTileset.type];
                if (factory) {
                    console.time(`  ⏱️ lazy load tileset: ${matchingTileset.config.name}`);
                    try {
                        cesiumTileset = await factory(matchingTileset.config);
                        this.viewer.scene.primitives.add(cesiumTileset);
                        this.loadedTilesets.set(matchingTileset.config, cesiumTileset);
                        console.timeEnd(`  ⏱️ lazy load tileset: ${matchingTileset.config.name}`);
                    } catch (err) {
                        console.warn(`Could not load tileset ${matchingTileset.config.name}:`, err.message);
                    }
                }
            }

            if (cesiumTileset) {
                cesiumTileset.show = true;
                this.activeTileset = matchingTileset;
            }
        } else {
            this.activeTileset = null;
        }

        // Adjust terrain exaggeration when 3D tilesets shown
        this.viewer.scene.verticalExaggeration = this.activeTileset ? 1.0 : this.baseExaggeration;

        console.timeEnd(`  ⏱️ setYear(${year})`);
    }

    /**
     * Store base terrain exaggeration
     */
    setBaseExaggeration(exaggeration) {
        this.baseExaggeration = exaggeration;
    }

    /**
     * Get active layer info for UI
     */
    getActiveInfo() {
        return {
            imagery: this.imageryLayers.map((layer, i) => ({
                name: this.activeImageryConfigs[i]?.name || 'Unknown',
                visible: layer.show,
                index: i
            })),
            tileset: this.activeTileset?.config.name || null
        };
    }

    /**
     * Toggle visibility of an imagery layer by index
     */
    toggleImageryLayer(index, visible) {
        if (this.imageryLayers[index]) {
            this.imageryLayers[index].show = visible;
        }
    }
}
