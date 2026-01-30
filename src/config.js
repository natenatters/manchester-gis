/**
 * Config Loader
 */

async function loadJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load ${url}`);
    return response.json();
}

export async function loadConfig(dataPath) {
    const config = await loadJson(`${dataPath}/config.json`);
    const layerConfig = await loadJson(`${dataPath}/layers.json`).catch(() => null);

    return { config, layerConfig };
}
