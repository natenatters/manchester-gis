/**
 * UI Controls
 */

import { updateMapLayerVisibility } from '../layers/entities3D.js';

// Reference to app (set in initUI)
let app = null;

/**
 * Initialize the UI controls
 */
export function initUI(appInstance) {
    app = appInstance;

    const container = document.getElementById('controls');
    container.innerHTML = buildControlsHTML();

    attachLayerToggles();
    attachYearSlider();
    updateStatus('Ready');
    updateLayerDisplay();
}

/**
 * Build the controls panel HTML
 */
function buildControlsHTML() {
    const title = app.config.name || 'Historical GIS';
    const defaultYear = app.config.defaultYear || 200;
    const groups = app.layerConfig.groups || {};
    const layerDefs = app.layerConfig.layers || {};

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

    // Build layers organized by group
    for (const [groupKey, group] of Object.entries(groups)) {
        const checked = group.defaultVisible ? 'checked' : '';

        // Get layers in this group that have data
        const groupLayers = Object.entries(layerDefs).filter(([key, def]) => {
            if (def.group !== groupKey) return false;
            const layer = app.layers[key];
            if (!layer) return false;
            const count = layer.dataSource?.entities?.values?.length || 0;
            return count > 0 || def.type === 'entities3d';
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

        for (const [key, def] of groupLayers) {
            const count = app.layers[key]?.dataSource?.entities?.values?.length || 0;
            const countLabel = count > 0 ? ` (${count})` : '';
            html += `
                <label class="layer-item">
                    <input type="checkbox" class="layer-toggle" data-layer="${key}" ${checked}>
                    <span class="layer-color" style="background: ${def.color}"></span>
                    ${def.name}${countLabel}
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
function attachLayerToggles() {
    // Individual layer toggles
    document.querySelectorAll('.layer-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            app.toggleLayer(e.target.dataset.layer, e.target.checked);
        });
    });

    // Group toggles
    document.querySelectorAll('.group-toggle').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const groupKey = e.target.dataset.group;
            const checked = e.target.checked;

            app.toggleGroup(groupKey, checked);

            // Update individual checkboxes
            const groupEl = document.getElementById(`group-${groupKey}`);
            groupEl.querySelectorAll('.layer-toggle').forEach(cb => {
                cb.checked = checked;
            });
        });
    });

    // Panel collapse
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
function attachYearSlider() {
    const slider = document.getElementById('yearSlider');
    const display = document.getElementById('yearDisplay');

    slider.addEventListener('input', async (e) => {
        const year = parseInt(e.target.value);
        display.textContent = `${year} AD`;
        await app.setYear(year);
        updateLayerDisplay();
        app.viewer.requestRender();
    });
}

/**
 * Update the active layer display with toggleable checkboxes
 */
export function updateLayerDisplay() {
    const display = document.getElementById('imageryDisplay');
    if (!display || !app?.layerManager) return;

    const info = app.layerManager.getActiveInfo();

    if (info.imagery.length === 0) {
        display.innerHTML = '<span class="no-imagery">No imagery</span>';
        syncMapVisibility([]);
        return;
    }

    // Build checkbox list
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

    // Sync building visibility
    syncMapVisibility(info.imagery);

    // Attach toggle handlers
    display.querySelectorAll('input[data-imagery-index]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const index = parseInt(e.target.dataset.imageryIndex);
            const visible = e.target.checked;
            app.layerManager.toggleImageryLayer(index, visible);

            // Update building visibility
            const layerName = info.imagery.find(l => l.index === index)?.name;
            if (layerName) {
                const entities3d = Object.values(app.layers).find(
                    l => l.config?.type === 'entities3d'
                );
                if (entities3d) {
                    updateMapLayerVisibility(entities3d.dataSource, layerName, visible);
                }
            }
        });
    });
}

/**
 * Sync building map visibility with current imagery layers
 */
function syncMapVisibility(imageryLayers) {
    const entities3d = Object.values(app.layers).find(
        l => l.config?.type === 'entities3d'
    );
    if (!entities3d) return;

    for (const layer of imageryLayers) {
        updateMapLayerVisibility(entities3d.dataSource, layer.name, layer.visible);
    }
}

/**
 * Update status message
 */
function updateStatus(message) {
    const status = document.getElementById('status');
    if (status) status.textContent = message;
}
