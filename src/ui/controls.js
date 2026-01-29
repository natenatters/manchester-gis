/**
 * UI Controls
 */

import { getLayerGroups, getLayerDefs, toggleLayer, toggleGroup, setYear } from '../layers/index.js';

// Store config for building UI
let projectConfig = {};
let storedLayerManager = null;
let loadedLayers = {};

/**
 * Initialize the UI controls
 * @param {Cesium.Viewer} viewer
 * @param {Object} layers - Layer data sources
 * @param {Object} config - Project configuration
 * @param {Object} [layerManager] - Unified temporal layer manager
 */
export function initUI(viewer, layers, config = {}, layerManager = null) {
    projectConfig = config;
    storedLayerManager = layerManager;
    loadedLayers = layers;
    const container = document.getElementById('controls');
    container.innerHTML = buildControlsHTML();

    // Attach event listeners
    attachLayerToggles(layers);
    attachYearSlider(viewer, layers, layerManager);

    // Update status
    updateStatus('Ready');
}

/**
 * Build the controls panel HTML
 */
function buildControlsHTML() {
    const title = projectConfig.name || 'Historical GIS';
    const defaultYear = projectConfig.defaultYear || 200;
    const groups = getLayerGroups();
    const layerDefs = getLayerDefs();

    let html = `
        <div class="controls-panel">
            <div class="controls-header">
                <h2>${title}</h2>
                <button id="toggleControls" class="toggle-btn">-</button>
            </div>
            <div id="controlsContent">
    `;

    // Year slider
    html += `
        <div class="layer-group">
            <div class="layer-group-title">Time Period</div>
            <div id="yearDisplay" class="year-display">${defaultYear} AD</div>
            <input type="range" id="yearSlider" min="0" max="2026" value="${defaultYear}">
            <div id="imageryDisplay" class="imagery-display"></div>
        </div>
    `;

    // Build layers organized by group (only show layers that have data)
    for (const [groupKey, group] of Object.entries(groups)) {
        const checked = group.defaultVisible ? 'checked' : '';

        // Get layers belonging to this group that have actual data
        const groupLayers = Object.entries(layerDefs).filter(([layerKey, layer]) => {
            if (layer.group !== groupKey) return false;
            const layerData = loadedLayers[layerKey];
            if (!layerData) return false;
            // Check if dataSource has entities
            const entityCount = layerData.dataSource?.entities?.values?.length || 0;
            return entityCount > 0 || layer.type === 'entities3d';
        });

        if (groupLayers.length === 0) continue;

        html += `
            <div class="layer-group">
                <div class="layer-group-title">
                    <label>
                        <input type="checkbox" class="group-toggle" data-group="${groupKey}" ${checked}>
                        ${group.name}
                    </label>
                </div>
                <div class="layer-list" id="group-${groupKey}">
        `;

        for (const [layerKey, layer] of groupLayers) {
            const layerData = loadedLayers[layerKey];
            const count = layerData?.dataSource?.entities?.values?.length || 0;
            const countLabel = count > 0 ? ` (${count})` : '';
            html += `
                <label class="layer-item">
                    <input type="checkbox" class="layer-toggle" data-layer="${layerKey}" ${checked}>
                    <span class="layer-color" style="background: ${layer.color}"></span>
                    ${layer.name}${countLabel}
                </label>
            `;
        }

        html += `</div></div>`;
    }

    html += `
                <div id="status" class="status">Loading...</div>
            </div>
        </div>
    `;

    return html;
}

/**
 * Attach layer toggle event listeners
 */
function attachLayerToggles(layers) {
    // Individual layer toggles
    document.querySelectorAll('.layer-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const layerKey = e.target.dataset.layer;
            toggleLayer(layers, layerKey, e.target.checked);
        });
    });

    // Group toggles
    document.querySelectorAll('.group-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const groupKey = e.target.dataset.group;
            const checked = e.target.checked;

            // Toggle all layers in group
            toggleGroup(layers, groupKey, checked);

            // Update individual checkboxes
            const groupEl = document.getElementById(`group-${groupKey}`);
            groupEl.querySelectorAll('.layer-toggle').forEach(cb => {
                cb.checked = checked;
            });
        });
    });

    // Panel collapse toggle
    document.getElementById('toggleControls').addEventListener('click', (e) => {
        const content = document.getElementById('controlsContent');
        const btn = e.target;
        if (content.style.display === 'none') {
            content.style.display = 'block';
            btn.textContent = '-';
        } else {
            content.style.display = 'none';
            btn.textContent = '+';
        }
    });
}

/**
 * Attach year slider event listener
 */
function attachYearSlider(viewer, layers, layerManager) {
    const slider = document.getElementById('yearSlider');
    const display = document.getElementById('yearDisplay');

    slider.addEventListener('input', async (e) => {
        const year = parseInt(e.target.value);
        display.textContent = `${year} AD`;
        await setYear(layers, year, layerManager);
        updateLayerDisplay(layerManager);
        viewer.scene.requestRender();
    });
}

/**
 * Update the active layer display with toggleable checkboxes
 */
function updateLayerDisplay(layerManager) {
    const display = document.getElementById('imageryDisplay');
    if (!display || !layerManager) return;

    const info = layerManager.getActiveInfo();

    if (info.imagery.length === 0) {
        display.innerHTML = '<span class="no-imagery">No imagery</span>';
        return;
    }

    // Build checkbox list for each active imagery layer
    let html = '';
    for (const layer of info.imagery) {
        const checked = layer.visible ? 'checked' : '';
        html += `
            <label class="imagery-toggle">
                <input type="checkbox" ${checked} data-imagery-index="${layer.index}">
                ${layer.name}
            </label>
        `;
    }
    display.innerHTML = html;

    // Attach toggle handlers
    display.querySelectorAll('input[data-imagery-index]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.imageryIndex);
            layerManager.toggleImageryLayer(index, e.target.checked);
        });
    });
}

/**
 * Update status message
 */
function updateStatus(message) {
    const status = document.getElementById('status');
    if (status) {
        status.textContent = message;
    }
}
