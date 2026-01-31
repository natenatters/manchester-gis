/**
 * Viewer - Thin Cesium wrapper
 */

import * as CesiumModule from 'cesium';
const Cesium = window.Cesium || CesiumModule;
import { createImageryProvider } from './imagery/index.js';

function dateFromYear(year) {
    const d = new Date(0);
    d.setFullYear(year);
    d.setMonth(6);
    d.setDate(1);
    return d;
}

export class Viewer {
    constructor(containerId) {
        if (import.meta.env.VITE_CESIUM_ION_TOKEN) {
            Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
        }

        this.cesium = new Cesium.Viewer(containerId, {
            timeline: false, animation: false, baseLayerPicker: false,
            geocoder: false, homeButton: true, sceneModePicker: true,
            navigationHelpButton: false, imageryProvider: false,
            requestRenderMode: true, maximumRenderTimeChange: Infinity,
            targetFrameRate: 30, useBrowserRecommendedResolution: true,
            shadows: false, terrainShadows: Cesium.ShadowMode.DISABLED
        });

        // Disable expensive effects
        const scene = this.cesium.scene;
        scene.fog.enabled = false;
        scene.globe.showGroundAtmosphere = false;
        scene.skyAtmosphere.show = false;
        scene.highDynamicRange = false;
        scene.skyBox.show = false;
        scene.sun.show = false;
        scene.moon.show = false;
        this.cesium.infoBox.frame.sandbox = 'allow-same-origin allow-popups allow-forms allow-scripts';

        // Clock bounds
        this.cesium.clock.startTime = Cesium.JulianDate.fromDate(dateFromYear(1));
        this.cesium.clock.stopTime = Cesium.JulianDate.fromDate(dateFromYear(2100));
        this.cesium.clock.clockRange = Cesium.ClockRange.CLAMPED;

        // State
        this._layers = [];
        this._tilesets = [];
        this._baseExaggeration = 1.0;
        this.onYearChange = null;  // Callback instead of event bus

        // Year change listener
        Cesium.knockout.getObservable(this.cesium.clockViewModel, 'currentTime').subscribe(() => {
            const year = this.year;
            this._updateVisibility(year);
            this.onYearChange?.(year);
            this.cesium.scene.requestRender();
        });

        // Camera persistence
        this.cesium.camera.changed.addEventListener(() => {
            const cam = this.cesium.camera;
            const pos = cam.positionCartographic;
            localStorage.setItem('camera', JSON.stringify({
                lon: Cesium.Math.toDegrees(pos.longitude),
                lat: Cesium.Math.toDegrees(pos.latitude),
                height: pos.height, heading: cam.heading, pitch: cam.pitch
            }));
        });
    }

    get year() {
        return Cesium.JulianDate.toGregorianDate(this.cesium.clock.currentTime).year;
    }

    set year(y) {
        this.cesium.clock.currentTime = Cesium.JulianDate.fromDate(dateFromYear(y));
    }

    async init(config) {
        console.log(`Loading: ${config.name}`);

        // Camera
        let cam = null;
        try { cam = JSON.parse(localStorage.getItem('camera')); } catch {}
        cam = cam || config.center;
        if (cam) {
            this.cesium.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(cam.lon, cam.lat, cam.height || 50000),
                orientation: { heading: cam.heading ?? 0, pitch: cam.pitch ?? Cesium.Math.toRadians(-90), roll: 0 }
            });
        }

        // Terrain
        if (config.terrain?.enabled) {
            this.cesium.scene.setTerrain(Cesium.Terrain.fromWorldTerrain());
        }
        this._baseExaggeration = config.terrain?.exaggeration || 1.0;

        // Layers
        for (const cfg of config.layers || []) {
            try {
                if (cfg.kind === 'imagery') {
                    const layer = this.cesium.imageryLayers.addImageryProvider(createImageryProvider(cfg));
                    layer._yearStart = cfg.yearStart ?? -Infinity;
                    layer._yearEnd = cfg.yearEnd ?? Infinity;
                    layer._userVisible = true;
                    layer.alpha = cfg.alpha ?? 1.0;
                    layer.show = false;
                    layer._name = cfg.name;
                    this._layers.push(layer);
                } else if (cfg.kind === 'tileset') {
                    const tileset = await this._createTileset(cfg);
                    if (tileset) {
                        tileset._yearStart = cfg.yearStart ?? -Infinity;
                        tileset._yearEnd = cfg.yearEnd ?? Infinity;
                        tileset.show = false;
                        this.cesium.scene.primitives.add(tileset);
                        this._tilesets.push(tileset);
                    }
                }
            } catch (e) { console.warn(`Layer ${cfg.name}:`, e.message); }
        }

        // Entities (CZML)
        if (config.entities) {
            const url = config.entities.startsWith('/')
                ? `${import.meta.env.BASE_URL}${config.entities.slice(1)}`
                : config.entities;
            const ds = await Cesium.CzmlDataSource.load(url);
            this.cesium.dataSources.add(ds);
            this._dataSource = ds;
            console.log(`Loaded ${ds.entities.values.length} entities`);
        }

        this._updateVisibility(this.year);
    }

    _updateVisibility(year) {
        for (const l of this._layers) {
            l.show = year >= l._yearStart && year <= l._yearEnd && l._userVisible;
        }
        let active = null;
        for (const t of this._tilesets) {
            t.show = year >= t._yearStart && year <= t._yearEnd && !active;
            if (t.show) active = t;
        }
        this.cesium.scene.verticalExaggeration = active ? 1.0 : this._baseExaggeration;
    }

    async _createTileset(cfg) {
        switch (cfg.type) {
            case 'google_3d': return Cesium.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
            case 'osm_buildings': return Cesium.createOsmBuildingsAsync();
            case 'url': return Cesium.Cesium3DTileset.fromUrl(cfg.url, { maximumScreenSpaceError: cfg.maximumScreenSpaceError || 16 });
            case 'ion': return Cesium.Cesium3DTileset.fromIonAssetId(cfg.assetId, { maximumScreenSpaceError: cfg.maximumScreenSpaceError || 16 });
        }
    }

    // --- UI Helpers ---

    getVisibleLayers(year) {
        return this._layers
            .filter(l => year >= l._yearStart && year <= l._yearEnd)
            .map((l, i) => ({ name: l._name, visible: l._userVisible, index: i }));
    }

    toggleLayer(index) {
        const visible = this._layers.filter(l => this.year >= l._yearStart && this.year <= l._yearEnd);
        if (visible[index]) {
            visible[index]._userVisible = !visible[index]._userVisible;
            this._updateVisibility(this.year);
            this.cesium.scene.requestRender();
        }
    }

    toggleGroup(group, visible) {
        for (const e of this._dataSource?.entities.values || []) {
            if ((e.properties?.group?.getValue?.() || e.properties?.group) === group) {
                e.show = visible;
            }
        }
        this.cesium.scene.requestRender();
    }
}
