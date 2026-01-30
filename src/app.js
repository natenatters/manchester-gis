/**
 * App
 *
 * Central state for the application.
 */

import * as Cesium from 'cesium';
import { loadConfig } from './config.js';
import { Viewer } from './viewer.js';
import { TemporalLayerManager } from './layers/TemporalLayerManager.js';
import { loadEntities3D, updateEntities3DVisibility } from './layers/entities3D.js';
import { initUI } from './ui/controls.js';
import { initBuildingEditor } from './ui/buildingEditor.js';

export class App {
    constructor() {
        this.config = null;
        this.layerConfig = null;
        this.year = 200;
        this.dataPath = null;
        this.viewer = null;
        this.layerManager = null;
        this.layers = {};
    }

    /**
     * Initialize the app
     */
    async init(containerId, project = 'example') {
        // Cesium Ion token
        const cesiumToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
        if (cesiumToken) {
            Cesium.Ion.defaultAccessToken = cesiumToken;
        }

        this.dataPath = `/data/projects/${project}`;

        // Load config
        const { config, layerConfig } = await loadConfig(this.dataPath);
        this.config = config;
        this.layerConfig = layerConfig || { groups: {}, layers: {} };
        this.year = config.defaultYear || 200;

        console.log(`Initializing ${this.config.name}...`);

        // Create viewer
        this.viewer = new Viewer(containerId, this.config);
        this.viewer.render({ exaggeration: this.config.terrain?.exaggeration || 1.0 });

        // Create layer manager
        this.layerManager = new TemporalLayerManager(this.viewer.cesium);
        this.layerManager.load(this.config.layers);
        this.layerManager.setBaseExaggeration(this.config.terrain?.exaggeration || 1.0);

        // Load data layers
        await this.loadLayers();

        // Set initial year (before UI so imagery display is correct)
        await this.setYear(this.config.defaultYear || 200);

        // Initialize UI
        initUI(this);
        initBuildingEditor(this);
    }

    /**
     * Load all data layers
     */
    async loadLayers() {
        // Create DataSource for each layer definition
        for (const [key, def] of Object.entries(this.layerConfig.layers || {})) {
            const group = this.layerConfig.groups?.[def.group] || { defaultVisible: true };

            if (def.type === 'entities3d') {
                const dataSource = await loadEntities3D(this.dataPath, this.year);
                dataSource.show = group.defaultVisible;
                this.viewer.cesium.dataSources.add(dataSource);
                this.layerManager.setEntities3dDataSource(dataSource);
                this.layers[key] = { dataSource, group: def.group, config: def };
            } else {
                const dataSource = new Cesium.CustomDataSource(key);
                dataSource.show = group.defaultVisible;
                this.viewer.cesium.dataSources.add(dataSource);
                this.layers[key] = { dataSource, group: def.group, config: def };
            }
        }

        // Load reference data
        const refData = await this.loadJson('/data/unified_sites.geojson');
        if (refData) this.populateLayers(refData, 'source');

        // Load curated project data
        const projData = await this.loadJson(`${this.dataPath}/sites.json`);
        if (projData) this.populateLayers(projData, 'layer');
    }

    /**
     * Load JSON with error handling
     */
    async loadJson(url) {
        try {
            const response = await fetch(url);
            if (response.ok) return response.json();
        } catch (err) {
            console.warn(`Could not load ${url}:`, err.message);
        }
        return null;
    }

    /**
     * Populate layers from GeoJSON
     */
    populateLayers(data, keyField) {
        const sourceToLayer = {};
        for (const [key, def] of Object.entries(this.layerConfig.layers || {})) {
            if (def.source) sourceToLayer[def.source] = key;
        }

        for (const feature of data.features || []) {
            const layerKey = keyField === 'source'
                ? sourceToLayer[feature.properties.source]
                : feature.properties.layer;

            const layer = this.layers[layerKey];
            if (!layer) continue;

            this.addFeature(layer, feature);
        }
    }

    /**
     * Add a GeoJSON feature to a layer
     */
    addFeature(layer, feature) {
        const props = feature.properties;
        const geom = feature.geometry;
        const color = Cesium.Color.fromCssColorString(layer.config.color || '#FF6B6B');

        if (geom.type === 'Point') {
            layer.dataSource.entities.add({
                position: Cesium.Cartesian3.fromDegrees(geom.coordinates[0], geom.coordinates[1]),
                point: {
                    pixelSize: 8,
                    color,
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 1,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                name: props.name,
                description: this.buildDescription(props)
            });
        } else if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
            const coords = geom.type === 'MultiLineString'
                ? geom.coordinates.flat()
                : geom.coordinates;
            const positions = coords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1]));

            layer.dataSource.entities.add({
                polyline: {
                    positions,
                    width: 4,
                    material: color,
                    clampToGround: true
                },
                name: props.name,
                description: this.buildDescription(props)
            });
        }
    }

    /**
     * Build HTML description for info popup
     */
    buildDescription(props) {
        const fields = [
            ['Type', props.site_type],
            ['Source', props.source_display],
            ['Date', props.start_year ? `${props.start_year}${props.end_year ? ' - ' + props.end_year : ''}` : null],
            ['Grade', props.grade],
            ['Description', props.description]
        ].filter(([, v]) => v);

        let html = '<table class="cesium-infoBox-defaultTable">';
        for (const [label, value] of fields) {
            html += `<tr><th>${label}</th><td>${value}</td></tr>`;
        }
        if (props.hyperlink) {
            html += `<tr><th>Link</th><td><a href="${props.hyperlink}" target="_blank">More info</a></td></tr>`;
        }
        return html + '</table>';
    }

    /**
     * Set the current year - ONE place for all visibility updates
     */
    async setYear(year) {
        this.year = year;

        // Update imagery + tilesets
        await this.layerManager.setYear(year);

        // Update all data layers
        for (const layer of Object.values(this.layers)) {
            if (layer.config.type === 'entities3d') {
                updateEntities3DVisibility(layer.dataSource, year);
            } else {
                this.updateLayerVisibility(layer.dataSource, year);
            }
        }
    }

    /**
     * Update entity visibility based on year
     */
    updateLayerVisibility(dataSource, year) {
        for (const entity of dataSource.entities.values) {
            const props = entity.properties;
            if (!props) continue;

            const start = props.start_year?.getValue();
            const end = props.end_year?.getValue();

            if (start === undefined && end === undefined) {
                entity.show = true;
            } else {
                entity.show = (start === undefined || year >= start)
                           && (end === undefined || year <= end);
            }
        }
    }

    /**
     * Toggle layer visibility
     */
    toggleLayer(key, visible) {
        if (this.layers[key]) {
            this.layers[key].dataSource.show = visible;
        }
    }

    /**
     * Toggle group visibility
     */
    toggleGroup(groupKey, visible) {
        for (const layer of Object.values(this.layers)) {
            if (layer.group === groupKey) {
                layer.dataSource.show = visible;
            }
        }
    }
}
