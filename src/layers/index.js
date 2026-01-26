/**
 * Layer Management
 *
 * Generic layer loader that reads layer definitions from project's layers.json.
 * Each layer is a Cesium CustomDataSource that can be toggled independently.
 */

import * as Cesium from 'cesium';
import { loadReconstructionsDataSource, updateReconstructionsVisibility } from './reconstructions3D.js';

// Current project state
let projectPath = '';
let currentYear = 200;
let layerConfig = { groups: {}, layers: {} };

/**
 * Load layer configuration from project
 */
async function loadLayerConfig(projPath) {
    try {
        const response = await fetch(`${projPath}/layers.json`);
        if (response.ok) {
            return await response.json();
        }
    } catch (err) {
        console.warn('Could not load layers.json:', err);
    }
    return { groups: {}, layers: {} };
}

/**
 * Load all data layers
 * @param {Cesium.Viewer} viewer
 * @param {string} projPath - Path to project folder
 * @param {Object} config - Project configuration
 * @param {Object} imageryManager - Temporal imagery manager
 * @returns {Object} Layer data sources by key
 */
export async function loadAllLayers(viewer, projPath, config = {}, imageryManager = null) {
    projectPath = projPath;
    currentYear = config.defaultYear || 200;

    // Load layer definitions from project
    layerConfig = await loadLayerConfig(projPath);

    const layers = {};

    // Create DataSource for each layer
    for (const [layerKey, layerDef] of Object.entries(layerConfig.layers)) {
        const groupDef = layerConfig.groups[layerDef.group] || { defaultVisible: true };

        // Handle special layer types
        if (layerDef.type === 'reconstruction') {
            // Load 3D reconstructions asynchronously
            try {
                const dataSource = await loadReconstructionsDataSource(projectPath, currentYear);
                dataSource.show = groupDef.defaultVisible;
                layers[layerKey] = {
                    dataSource,
                    group: layerDef.group,
                    config: layerDef
                };
                viewer.dataSources.add(dataSource);
                console.log(`Loaded reconstruction layer: ${layerDef.name}`);
            } catch (err) {
                console.warn(`Could not load reconstruction layer ${layerKey}:`, err);
            }
        } else {
            // Standard layer
            const dataSource = new Cesium.CustomDataSource(layerKey);
            dataSource.show = groupDef.defaultVisible;

            layers[layerKey] = {
                dataSource,
                group: layerDef.group,
                config: layerDef
            };

            viewer.dataSources.add(dataSource);
        }
    }

    // Load reference data from unified GeoJSON
    try {
        const response = await fetch('/data/unified_sites.geojson');
        if (response.ok) {
            const data = await response.json();
            populateReferenceLayers(data, layers);
            console.log(`Loaded ${data.features.length} reference features`);
        }
    } catch (err) {
        console.warn('Could not load unified_sites.geojson:', err);
    }

    // Load curated project data
    try {
        const response = await fetch(`${projectPath}/sites.json`);
        if (response.ok) {
            const data = await response.json();
            populateCuratedLayers(data, layers);
            console.log(`Loaded curated project: ${data.metadata?.project || 'unnamed'}`);
        }
    } catch (err) {
        console.warn('Could not load curated project:', err);
    }

    return layers;
}

/**
 * Build source-to-layer mapping from layer config
 */
function buildSourceMapping() {
    const mapping = {};
    for (const [layerKey, layerDef] of Object.entries(layerConfig.layers)) {
        if (layerDef.source) {
            mapping[layerDef.source] = layerKey;
        }
    }
    return mapping;
}

/**
 * Populate reference layers from unified GeoJSON
 */
function populateReferenceLayers(data, layers) {
    const sourceMapping = buildSourceMapping();

    for (const feature of data.features) {
        const source = feature.properties.source;
        const layerKey = sourceMapping[source];

        if (!layerKey || !layers[layerKey]) {
            continue;
        }

        const layer = layers[layerKey];
        const geom = feature.geometry;
        const props = feature.properties;
        const color = layer.config.color || '#FF6B6B';

        if (geom.type === 'Point') {
            addPointEntity(layer.dataSource, feature, props, color);
        } else if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
            addPolylineEntity(layer.dataSource, feature, props, color);
        }
    }
}

/**
 * Populate curated layers from project data
 */
function populateCuratedLayers(data, layers) {
    for (const feature of data.features) {
        const layerKey = feature.properties.layer;

        if (!layerKey || !layers[layerKey]) {
            continue;
        }

        const layer = layers[layerKey];
        const color = layer.config.color || '#FF6B6B';
        addPointEntity(layer.dataSource, feature, feature.properties, color);
    }
}

/**
 * Add a point entity to a DataSource
 */
function addPointEntity(dataSource, feature, props, color) {
    const coords = feature.geometry.coordinates;

    dataSource.entities.add({
        position: Cesium.Cartesian3.fromDegrees(coords[0], coords[1]),
        point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString(color),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1
        },
        name: props.name,
        description: buildDescription(props)
    });
}

/**
 * Add a polyline entity to a DataSource (for roads)
 */
function addPolylineEntity(dataSource, feature, props, color) {
    const geom = feature.geometry;

    // Flatten MultiLineString
    let allCoords = [];
    if (geom.type === 'MultiLineString') {
        geom.coordinates.forEach(line => allCoords = allCoords.concat(line));
    } else {
        allCoords = geom.coordinates;
    }

    const positions = allCoords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1]));

    // Style based on evidence level
    const evidenceLevel = props.evidence_level || 'unknown';
    const isConjecture = evidenceLevel === 'conjecture';

    let material = Cesium.Color.fromCssColorString(color);
    let width = 4;

    if (isConjecture) {
        material = new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString(color).withAlpha(0.6),
            dashLength: 16.0
        });
        width = 3;
    }

    dataSource.entities.add({
        polyline: {
            positions,
            width,
            material,
            clampToGround: true
        },
        name: props.name,
        description: buildDescription(props)
    });
}

/**
 * Build HTML description for info box
 */
function buildDescription(props) {
    let html = '<table class="cesium-infoBox-defaultTable">';

    const fields = [
        ['Type', props.site_type],
        ['Source', props.source_display],
        ['Date', props.start_year ? `${props.start_year}${props.end_year ? ' - ' + props.end_year : ''}` : null],
        ['Grade', props.grade],
        ['Evidence', props.evidence_level],
        ['Description', props.description]
    ];

    for (const [label, value] of fields) {
        if (value) {
            html += `<tr><th>${label}</th><td>${value}</td></tr>`;
        }
    }

    if (props.hyperlink) {
        html += `<tr><th>Link</th><td><a href="${props.hyperlink}" target="_blank">More info</a></td></tr>`;
    }

    html += '</table>';
    return html;
}

/**
 * Get layer groups for UI
 */
export function getLayerGroups() {
    return layerConfig.groups;
}

/**
 * Get layer definitions for UI
 */
export function getLayerDefs() {
    return layerConfig.layers;
}

/**
 * Toggle a layer's visibility
 */
export function toggleLayer(layers, layerKey, visible) {
    if (layers[layerKey]) {
        layers[layerKey].dataSource.show = visible;
    }
}

/**
 * Toggle an entire group's visibility
 */
export function toggleGroup(layers, groupKey, visible) {
    for (const [key, layer] of Object.entries(layers)) {
        if (layer.group === groupKey) {
            layer.dataSource.show = visible;
        }
    }
}

/**
 * Update the current year and refresh visibility
 * @param {Object} layers
 * @param {number} year
 * @param {Object} [imageryManager] - Temporal imagery manager
 * @param {Object} [tilesetManager] - Temporal tileset manager
 */
export function setYear(layers, year, imageryManager = null, tilesetManager = null) {
    currentYear = year;

    // Update imagery layers (2D maps)
    if (imageryManager) {
        imageryManager.setYear(year);
    }

    // Update 3D tilesets (buildings/photogrammetry)
    if (tilesetManager) {
        tilesetManager.setYear(year);
    }

    // Update all data layers
    for (const [key, layer] of Object.entries(layers)) {
        if (layer.config.type === 'reconstruction') {
            // Reconstruction layers have their own visibility logic
            updateReconstructionsVisibility(layer.dataSource, year);
        } else {
            // Standard layers: filter entities by year
            updateEntityVisibility(layer.dataSource, year);
        }
    }
}

/**
 * Update entity visibility based on year
 * Entities with start_year/end_year properties are shown/hidden accordingly
 * @param {Cesium.CustomDataSource} dataSource
 * @param {number} year
 */
function updateEntityVisibility(dataSource, year) {
    const entities = dataSource.entities.values;

    for (const entity of entities) {
        const props = entity.properties;
        if (!props) {
            continue;
        }

        // Get temporal bounds from properties
        const startYear = props.start_year?.getValue();
        const endYear = props.end_year?.getValue();

        // If no temporal data, always show
        if (startYear === undefined && endYear === undefined) {
            entity.show = true;
            continue;
        }

        // Check if current year is within range
        const afterStart = startYear === undefined || year >= startYear;
        const beforeEnd = endYear === undefined || year <= endYear;

        entity.show = afterStart && beforeEnd;
    }
}

/**
 * Get current year
 */
export function getYear() {
    return currentYear;
}
