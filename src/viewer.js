/**
 * Cesium Viewer
 */

import * as Cesium from 'cesium';

export class Viewer {
    constructor(containerId, config = {}) {
        const center = config.center || { lon: 0, lat: 51.5, height: 100000 };

        this.cesium = new Cesium.Viewer(containerId, {
            timeline: false,
            animation: false,
            baseLayerPicker: false,
            geocoder: false,
            homeButton: true,
            sceneModePicker: true,
            navigationHelpButton: false,
            imageryProvider: false,
            requestRenderMode: true,
            maximumRenderTimeChange: Infinity,
            targetFrameRate: 30,
            useBrowserRecommendedResolution: true,
            shadows: false,
            terrainShadows: Cesium.ShadowMode.DISABLED
        });

        // Disable expensive effects
        this.cesium.scene.fog.enabled = false;
        this.cesium.scene.globe.showGroundAtmosphere = false;
        this.cesium.scene.skyAtmosphere.show = false;
        this.cesium.scene.highDynamicRange = false;
        this.cesium.scene.skyBox.show = false;
        this.cesium.scene.sun.show = false;
        this.cesium.scene.moon.show = false;
        this.cesium.infoBox.frame.sandbox = 'allow-same-origin allow-popups allow-forms allow-scripts';

        // Set camera over project center
        this.cesium.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, center.height),
            orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 }
        });

        // Set up terrain if configured
        if (config.terrain?.enabled) {
            this.cesium.scene.setTerrain(Cesium.Terrain.fromWorldTerrain());
        }
    }

    /**
     * Apply render updates
     */
    render(updates = {}) {
        if (updates.exaggeration !== undefined) {
            this.cesium.scene.verticalExaggeration = updates.exaggeration;
        }
    }

    /**
     * Request a render frame
     */
    requestRender() {
        this.cesium.scene.requestRender();
    }
}
