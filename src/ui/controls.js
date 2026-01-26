/**
 * UI Controls
 */

import { LAYER_GROUPS, toggleLayer, toggleGroup } from '../layers/index.js';

/**
 * Initialize the UI controls
 * @param {Cesium.Viewer} viewer
 * @param {Object} layers - Layer data sources
 */
export function initUI(viewer, layers) {
    const container = document.getElementById('controls');
    container.innerHTML = buildControlsHTML();

    // Attach event listeners
    attachLayerToggles(layers);
    attachYearSlider(viewer, layers);

    // Update status
    updateStatus('Ready');
}

/**
 * Build the controls panel HTML
 */
function buildControlsHTML() {
    let html = `
        <div class="controls-panel">
            <div class="controls-header">
                <h2>Manchester GIS</h2>
                <button id="toggleControls" class="toggle-btn">-</button>
            </div>
            <div id="controlsContent">
    `;

    // Year slider
    html += `
        <div class="layer-group">
            <div class="layer-group-title">Time Period</div>
            <div id="yearDisplay" class="year-display">200 AD</div>
            <input type="range" id="yearSlider" min="0" max="2026" value="200">
        </div>
    `;

    // Layer groups
    for (const [groupKey, group] of Object.entries(LAYER_GROUPS)) {
        const checked = group.defaultVisible ? 'checked' : '';

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

        for (const [layerKey, layer] of Object.entries(group.layers)) {
            html += `
                <label class="layer-item">
                    <input type="checkbox" class="layer-toggle" data-layer="${layerKey}" ${checked}>
                    <span class="layer-color" style="background: ${layer.color}"></span>
                    ${layer.name}
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
function attachYearSlider(viewer, layers) {
    const slider = document.getElementById('yearSlider');
    const display = document.getElementById('yearDisplay');

    slider.addEventListener('input', (e) => {
        const year = parseInt(e.target.value);
        display.textContent = `${year} AD`;
        // TODO: Filter entities by year
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
