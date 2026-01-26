/**
 * Layer Management
 *
 * Each layer is a Cesium CustomDataSource that can be toggled independently.
 * Layers are organized into groups:
 * - curated: User's researched/verified data (visible by default)
 * - reference: Third-party data for research (hidden by default)
 * - reconstructions: 3D models (toggle)
 */

import * as Cesium from 'cesium';

// Layer definitions
export const LAYER_GROUPS = {
    curated: {
        name: 'My Project',
        description: 'Your curated, researched sites',
        defaultVisible: true,
        layers: {
            roman: { name: 'Roman Sites', color: '#8B0000' },
            medieval: { name: 'Medieval Sites', color: '#DAA520' },
            ownership: { name: 'Ownership Chains', color: '#4169E1' }
        }
    },
    reconstructions: {
        name: '3D Reconstructions',
        description: '3D fort models',
        defaultVisible: false,
        layers: {
            roman3d: { name: 'Roman Fort Models', color: '#CD853F' }
        }
    },
    reference: {
        name: 'Reference Data',
        description: 'Third-party sources for research',
        defaultVisible: false,
        layers: {
            romanRoads: { name: 'Roman Roads (Itiner-e)', color: '#8B0000' },
            heListedBuildings: { name: 'Listed Buildings', color: '#1E90FF' },
            heScheduledMonuments: { name: 'Scheduled Monuments', color: '#FFD700' },
            heParksGardens: { name: 'Parks & Gardens', color: '#228B22' },
            heHeritageAtRisk: { name: 'Heritage at Risk', color: '#FF4500' },
            heBattlefields: { name: 'Battlefields', color: '#DC143C' },
            heConservationAreas: { name: 'Conservation Areas', color: '#9370DB' },
            domesday: { name: 'Domesday (1086)', color: '#8B4513' },
            gb1900: { name: 'GB1900 Gazetteer', color: '#696969' },
            wikidata: { name: 'Wikidata Sites', color: '#4682B4' },
            osm: { name: 'OSM Buildings', color: '#708090' }
        }
    }
};

/**
 * Load all data layers
 * @param {Cesium.Viewer} viewer
 * @returns {Object} Layer data sources by key
 */
export async function loadAllLayers(viewer) {
    const layers = {};

    // Create DataSource for each layer
    for (const [groupKey, group] of Object.entries(LAYER_GROUPS)) {
        for (const [layerKey, layer] of Object.entries(group.layers)) {
            const dataSource = new Cesium.CustomDataSource(layerKey);
            dataSource.show = group.defaultVisible;

            layers[layerKey] = {
                dataSource,
                group: groupKey,
                config: layer
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
        const response = await fetch('/data/projects/example/sites.json');
        if (response.ok) {
            const data = await response.json();
            populateCuratedLayers(data, layers);
            console.log(`Loaded curated project: ${data.metadata.project}`);
        }
    } catch (err) {
        console.warn('Could not load curated project:', err);
    }

    return layers;
}

/**
 * Map source names to layer keys
 */
const SOURCE_TO_LAYER = {
    'roman_roads': 'romanRoads',
    'he_listed_buildings': 'heListedBuildings',
    'he_scheduled_monuments': 'heScheduledMonuments',
    'he_parks_gardens': 'heParksGardens',
    'he_heritage_at_risk': 'heHeritageAtRisk',
    'he_battlefields': 'heBattlefields',
    'he_conservation_areas': 'heConservationAreas',
    'domesday': 'domesday',
    'gb1900': 'gb1900',
    'wikidata': 'wikidata',
    'osm': 'osm',
    'curated': 'roman'  // Default curated to roman layer for now
};

/**
 * Populate reference layers from unified GeoJSON
 */
function populateReferenceLayers(data, layers) {
    for (const feature of data.features) {
        const source = feature.properties.source;
        const layerKey = SOURCE_TO_LAYER[source];

        if (!layerKey || !layers[layerKey]) {
            continue;
        }

        const layer = layers[layerKey];
        const geom = feature.geometry;
        const props = feature.properties;

        if (geom.type === 'Point') {
            addPointEntity(layer.dataSource, feature, props);
        } else if (geom.type === 'LineString' || geom.type === 'MultiLineString') {
            addPolylineEntity(layer.dataSource, feature, props);
        }
    }
}

/**
 * Populate curated layers from project data
 */
function populateCuratedLayers(data, layers) {
    for (const feature of data.features) {
        const layerKey = feature.properties.layer || 'roman';

        if (!layers[layerKey]) {
            continue;
        }

        const layer = layers[layerKey];
        addPointEntity(layer.dataSource, feature, feature.properties);
    }
}

/**
 * Add a point entity to a DataSource
 */
function addPointEntity(dataSource, feature, props) {
    const coords = feature.geometry.coordinates;

    dataSource.entities.add({
        position: Cesium.Cartesian3.fromDegrees(coords[0], coords[1]),
        point: {
            pixelSize: 8,
            color: Cesium.Color.fromCssColorString('#FF6B6B'),
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
function addPolylineEntity(dataSource, feature, props) {
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

    let material = Cesium.Color.fromCssColorString('#8B0000');
    let width = 4;

    if (isConjecture) {
        material = new Cesium.PolylineDashMaterialProperty({
            color: Cesium.Color.fromCssColorString('#8B0000').withAlpha(0.6),
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
