/**
 * App - UI and orchestration layer
 *
 * Owns:
 * - UI rendering (controls panel, entity info panel)
 * - User interactions
 * - Viewer instance
 */

import { Viewer } from './viewer.js';

export class App {
    constructor(containerId, controlsId) {
        this._container = document.getElementById(controlsId);
        this._yearDisplay = null;
        this._yearSlider = null;
        this._title = 'Historical GIS';
        this._groups = new Set();
        this._layers = { imagery: [] };
        this._defaultYear = 2000;
        this._selectedEntity = null;

        // Create viewer
        this.viewer = new Viewer(containerId);

        // Listen to viewer events
        this.viewer.on('yearChange', (year) => this._onYearChange(year));
        this.viewer.on('entitiesChange', (entities) => this._onEntitiesChange(entities));
        this.viewer.on('entitySelect', (entity) => this._onEntitySelect(entity));
    }

    async init(config) {
        this._title = config.name || 'Historical GIS';
        this._defaultYear = config.defaultYear || 2000;

        // Initialize viewer
        await this.viewer.init(config);

        // Render UI
        this._render();
        this._createEntityPanel();
    }

    // --- Viewer event handlers ---

    _onYearChange(year) {
        if (this._yearDisplay) this._yearDisplay.textContent = `${year} AD`;
        if (this._yearSlider) this._yearSlider.value = year;
        this._layers = this.viewer.getLayerInfo(year);
        this._updateLayerDisplay();
    }

    _onEntitiesChange(entities) {
        // Derive groups from entities
        this._groups = new Set();
        for (const entity of entities) {
            const group = entity.properties?.group?.getValue?.() || entity.properties?.group;
            if (group) this._groups.add(group);
        }
        // Debounce render for bulk entity loads
        clearTimeout(this._renderTimeout);
        this._renderTimeout = setTimeout(() => this._render(), 10);
    }

    _onEntitySelect(entity) {
        this._selectedEntity = entity;
        this._updateEntityPanel();
    }

    // --- UI rendering ---

    _render() {
        this._container.innerHTML = this._buildHTML();
        this._attachHandlers();
        this._updateLayerDisplay();
    }

    _buildHTML() {
        let html = `
            <div class="controls-panel">
                <div class="controls-header">
                    <h2>${this._title}</h2>
                    <button id="toggleControls" class="toggle-btn">-</button>
                </div>
                <div id="controlsContent">
        `;

        // Year slider
        html += `
            <div class="layer-group">
                <div class="layer-group-title">Time Period</div>
                <div id="yearDisplay" class="year-display">${this._defaultYear} AD</div>
                <input type="range" id="yearSlider" min="0" max="2026" value="${this._defaultYear}">
                <div id="imageryDisplay" class="imagery-display"></div>
            </div>
        `;

        // Group toggles
        for (const group of this._groups) {
            html += `
                <div class="layer-group">
                    <div class="layer-group-title">
                        <label>
                            <input type="checkbox" class="group-toggle" data-group="${group}" checked>
                            ${group}
                        </label>
                    </div>
                </div>
            `;
        }

        html += `
                    <div id="status" class="status">Ready</div>
                </div>
            </div>
        `;

        return html;
    }

    _attachHandlers() {
        // Year slider
        this._yearSlider = this._container.querySelector('#yearSlider');
        this._yearDisplay = this._container.querySelector('#yearDisplay');

        this._yearSlider.addEventListener('input', (e) => {
            const year = parseInt(e.target.value);
            localStorage.setItem('year', year);
            this.viewer.setYear(year);
        });

        // Initialize year from localStorage or default
        const saved = localStorage.getItem('year');
        const initialYear = saved !== null ? parseInt(saved, 10) : this._defaultYear;
        this.viewer.setYear(initialYear);

        // Group toggles
        this._container.querySelectorAll('.group-toggle').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.viewer.toggleGroup(e.target.dataset.group, e.target.checked);
            });
        });

        // Panel collapse
        this._container.querySelector('#toggleControls').addEventListener('click', (e) => {
            const content = this._container.querySelector('#controlsContent');
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

    _updateLayerDisplay() {
        const display = this._container.querySelector('#imageryDisplay');
        if (!display) return;

        const imagery = this._layers?.imagery || [];

        if (imagery.length === 0) {
            display.innerHTML = '<span class="no-imagery">No imagery</span>';
            return;
        }

        let html = '';
        for (const layer of imagery) {
            const checked = layer.visible ? 'checked' : '';
            html += `
                <label class="imagery-toggle">
                    <input type="checkbox" ${checked} data-imagery-index="${layer.index}">
                    ${layer.name}
                </label>
            `;
        }
        display.innerHTML = html;

        display.querySelectorAll('input[data-imagery-index]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.viewer.toggleImagery(parseInt(e.target.dataset.imageryIndex));
                this._layers = this.viewer.getLayerInfo(this.viewer.year);
                this._updateLayerDisplay();
            });
        });
    }

    // --- Entity Info Panel ---

    _createEntityPanel() {
        const existing = document.getElementById('entityPanel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'entityPanel';
        panel.className = 'entity-panel';
        panel.innerHTML = `
            <div class="entity-panel-header">
                <span id="entityName">Select an entity</span>
                <button id="entityPanelClose" class="entity-panel-close">&times;</button>
            </div>
            <div id="entityContent" class="entity-panel-content"></div>
        `;
        document.body.appendChild(panel);

        document.getElementById('entityPanelClose').addEventListener('click', () => {
            this.viewer.clearSelection();
        });
    }

    _updateEntityPanel() {
        const panel = document.getElementById('entityPanel');
        const nameEl = document.getElementById('entityName');
        const contentEl = document.getElementById('entityContent');

        if (!this._selectedEntity) {
            panel.classList.remove('visible');
            nameEl.textContent = 'Select an entity';
            contentEl.innerHTML = '';
            return;
        }

        const entity = this._selectedEntity;
        const name = entity.name || entity.id || 'Unknown';
        const props = entity.properties;

        nameEl.textContent = name;

        // Build properties display
        let html = '<table class="entity-props">';

        // ID
        html += `<tr><th>ID</th><td>${entity.id || '--'}</td></tr>`;

        // Group
        const group = props?.group?.getValue?.() || props?.group;
        if (group) {
            html += `<tr><th>Group</th><td>${group}</td></tr>`;
        }

        // Availability (years)
        if (entity.availability) {
            const start = entity.availability.start?.toString?.() || '';
            const stop = entity.availability.stop?.toString?.() || '';
            if (start || stop) {
                // Extract years from JulianDate strings
                const startYear = start ? new Date(start).getFullYear() : '?';
                const stopYear = stop ? new Date(stop).getFullYear() : '?';
                html += `<tr><th>Period</th><td>${startYear} - ${stopYear}</td></tr>`;
            }
        }

        // Other properties
        if (props) {
            const skip = ['group'];
            const propNames = props.propertyNames || [];
            for (const propName of propNames) {
                if (skip.includes(propName)) continue;
                const value = props[propName]?.getValue?.() || props[propName];
                if (value !== undefined && value !== null && value !== '') {
                    html += `<tr><th>${propName}</th><td>${value}</td></tr>`;
                }
            }
        }

        html += '</table>';
        contentEl.innerHTML = html;
        panel.classList.add('visible');
    }
}
