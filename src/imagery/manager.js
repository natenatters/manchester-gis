/**
 * Temporal Imagery Manager
 * Manages multiple imagery layers and switches visibility based on the current year
 */

import { createImageryProvider, DEFAULT_IMAGERY } from './index.js';

/**
 * @typedef {Object} TemporalImageryLayer
 * @property {Cesium.ImageryLayer} layer - The Cesium imagery layer
 * @property {Object} config - Original configuration
 * @property {number} yearStart - Start year (inclusive)
 * @property {number} yearEnd - End year (inclusive)
 */

/**
 * Manages temporal imagery layers for a Cesium viewer
 */
export class ImageryManager {
    /**
     * @param {Cesium.Viewer} viewer - Cesium viewer instance
     */
    constructor(viewer) {
        this.viewer = viewer;
        /** @type {TemporalImageryLayer[]} */
        this.layers = [];
        this.currentYear = null;
        this.activeLayer = null;
    }

    /**
     * Load imagery configuration (single object or array)
     * @param {Object|Object[]} imageryConfig - Imagery configuration
     */
    load(imageryConfig) {
        // Normalize to array
        const configs = Array.isArray(imageryConfig)
            ? imageryConfig
            : [imageryConfig || DEFAULT_IMAGERY];

        // Create layers in reverse order so first config is on top
        for (let i = configs.length - 1; i >= 0; i--) {
            const config = configs[i];
            const provider = createImageryProvider(config);
            const layer = this.viewer.imageryLayers.addImageryProvider(provider);

            // Set alpha from config
            layer.alpha = config.alpha !== undefined ? config.alpha : 1.0;

            // Initially hide all layers
            layer.show = false;

            this.layers.push({
                layer,
                config,
                yearStart: config.yearStart ?? -Infinity,
                yearEnd: config.yearEnd ?? Infinity
            });
        }

        // Reverse to match config order (first = highest priority)
        this.layers.reverse();
    }

    /**
     * Find layers that match a given year
     * @param {number} year
     * @returns {TemporalImageryLayer[]}
     */
    getLayersForYear(year) {
        return this.layers.filter(l =>
            year >= l.yearStart && year <= l.yearEnd
        );
    }

    /**
     * Set the current year and update layer visibility
     * @param {number} year
     * @returns {TemporalImageryLayer|null} The active layer
     */
    setYear(year) {
        this.currentYear = year;

        // Find matching layers
        const matching = this.getLayersForYear(year);

        // Hide all layers
        for (const l of this.layers) {
            l.layer.show = false;
        }

        // Show the first matching layer (highest priority)
        if (matching.length > 0) {
            this.activeLayer = matching[0];
            this.activeLayer.layer.show = true;
        } else {
            // No match - show first layer as fallback
            this.activeLayer = this.layers[0] || null;
            if (this.activeLayer) {
                this.activeLayer.layer.show = true;
            }
        }

        return this.activeLayer;
    }

    /**
     * Get all layers available for the current year (for UI picker)
     * @returns {TemporalImageryLayer[]}
     */
    getAvailableLayers() {
        if (this.currentYear === null) {
            return this.layers;
        }
        return this.getLayersForYear(this.currentYear);
    }

    /**
     * Manually select a specific layer (override automatic selection)
     * @param {number} index - Index in the layers array
     */
    selectLayer(index) {
        if (index < 0 || index >= this.layers.length) {
            return;
        }

        // Hide all
        for (const l of this.layers) {
            l.layer.show = false;
        }

        // Show selected
        this.activeLayer = this.layers[index];
        this.activeLayer.layer.show = true;
    }

    /**
     * Get the currently active layer
     * @returns {TemporalImageryLayer|null}
     */
    getActiveLayer() {
        return this.activeLayer;
    }

    /**
     * Get layer info for UI display
     * @returns {Object[]}
     */
    getLayerInfo() {
        return this.layers.map((l, i) => ({
            index: i,
            name: l.config.name || l.config.credit || `Layer ${i + 1}`,
            yearStart: l.yearStart === -Infinity ? null : l.yearStart,
            yearEnd: l.yearEnd === Infinity ? null : l.yearEnd,
            isActive: l === this.activeLayer
        }));
    }
}
