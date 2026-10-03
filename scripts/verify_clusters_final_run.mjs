import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9280;

async function run() {
  console.log('🚀 Running Full Cluster Translucency & Basemap Verification...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-translucent-full'
  ]);

  await new Promise(r => setTimeout(r, 1500));

  try {
    const listRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${PORT}/json/list`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });

    const page = listRes.find(p => p.type === 'page') || listRes[0];
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && callbacks.has(data.id)) {
        callbacks.get(data.id)(data);
        callbacks.delete(data.id);
      }
    };

    const send = (method, params = {}) => {
      return new Promise((resolve) => {
        const id = msgId++;
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    await new Promise((resolve) => {
      if (ws.readyState === WebSocket.OPEN) resolve();
      else ws.onopen = resolve;
    });

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('1. Navigating to http://localhost:5173/ ...');
    await send('Page.navigate', { url: 'http://localhost:5173/' });

    // Wait until loading screen has unmounted
    console.log('2. Waiting for loading screen to complete and unmount...');
    let unmounted = false;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 400));
      const res = await send('Runtime.evaluate', {
        expression: `({
          unmounted: !document.querySelector('.z-50'),
          hasMap: !!window.__map,
          mapLoaded: window.__map ? window.__map.loaded() : false
        })`,
        returnByValue: true
      });
      if (res.result?.value?.unmounted && res.result?.value?.hasMap) {
        unmounted = true;
        console.log(`✅ App ready and loading screen unmounted after ${(i + 1) * 400}ms`);
        break;
      }
    }

    if (!unmounted) {
      console.log('Loader taking longer; waiting additional 3 seconds...');
      await new Promise(r => setTimeout(r, 3000));
    }

    // Inspect paint properties
    const paintProps = await send('Runtime.evaluate', {
      expression: `(() => {
        const m = window.__map;
        if (!m) return null;
        return {
          clusterOpacity: m.getPaintProperty('clusters-circle', 'circle-opacity'),
          clusterStrokeWidth: m.getPaintProperty('clusters-circle', 'circle-stroke-width'),
          clusterStrokeColor: m.getPaintProperty('clusters-circle', 'circle-stroke-color'),
          clusterStrokeOpacity: m.getPaintProperty('clusters-circle', 'circle-stroke-opacity'),
          clusterTextColor: m.getPaintProperty('cluster-count', 'text-color'),
          clusterTextHaloColor: m.getPaintProperty('cluster-count', 'text-halo-color'),
          clusterTextHaloWidth: m.getPaintProperty('cluster-count', 'text-halo-width'),
          unclusteredOpacity: m.getPaintProperty('unclustered-point', 'circle-opacity'),
          unclusteredStrokeWidth: m.getPaintProperty('unclustered-point', 'circle-stroke-width'),
          unclusteredStrokeColor: m.getPaintProperty('unclustered-point', 'circle-stroke-color'),
          unclusteredStrokeOpacity: m.getPaintProperty('unclustered-point', 'circle-stroke-opacity')
        };
      })()`,
      returnByValue: true
    });
    console.log('MapLibre Layer Paint Configuration:', JSON.stringify(paintProps.result?.value, null, 2));

    // 1. Overview: India Hotspots at Zoom 4.8
    console.log('📸 1. Capturing Regional Overview with Translucent Clusters (Natural Basemap, Zoom 4.8)...');
    await send('Runtime.evaluate', {
      expression: `if (window.__map) window.__map.flyTo({ center: [78.96, 22.0], zoom: 4.8 });`
    });
    await new Promise(r => setTimeout(r, 1800));
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_1_natural_overview.png', Buffer.from(shot.result.data, 'base64'));

    // 2. High-Density Cluster Area (Punjab/Northern India: Zoom 6.5)
    console.log('📸 2. Capturing Dense Clusters showing terrain visibility through circles (Zoom 6.5)...');
    await send('Runtime.evaluate', {
      expression: `if (window.__map) window.__map.flyTo({ center: [75.0, 31.5], zoom: 6.5 });`
    });
    await new Promise(r => setTimeout(r, 1800));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_2_natural_zoom6_5.png', Buffer.from(shot.result.data, 'base64'));

    // 3. Switch to Thermal IR Basemap
    console.log('📸 3. Switching to Thermal IR Basemap (Zoom 6.5)...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Thermal');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1800));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_3_thermal_basemap.png', Buffer.from(shot.result.data, 'base64'));

    // 4. Switch to Dark GIS Basemap
    console.log('📸 4. Switching to Dark GIS Basemap (Zoom 6.5)...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Dark');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1800));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_4_dark_basemap.png', Buffer.from(shot.result.data, 'base64'));

    // 5. Local Zoom (Zoom 11.5) with unclustered translucent detections & spider legs
    console.log('📸 5. Zooming into Local Detections (Zoom 11.5)...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Natural');
        if (btn) btn.click();
        if (window.__map) window.__map.flyTo({ center: [74.8955, 32.1891], zoom: 11.5 });
      `
    });
    await new Promise(r => setTimeout(r, 1800));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_5_local_detections.png', Buffer.from(shot.result.data, 'base64'));

    // 6. Selected Event Inspection (Click on detection)
    console.log('📸 6. Clicking detection to verify Selected Event reticle & panel...');
    await send('Runtime.evaluate', {
      expression: `
        if (window.__map) {
          const pt = window.__map.project([74.8955, 32.1891]);
          const features = window.__map.queryRenderedFeatures(pt, { layers: ['unclustered-point'] });
          if (features.length > 0) {
            window.__map.fire('click', {
              point: pt,
              lngLat: { lng: 74.8955, lat: 32.1891 },
              features: features
            });
          }
        }
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_6_selected_event.png', Buffer.from(shot.result.data, 'base64'));

    ws.close();
    chrome.kill();
    console.log('🎉 All translucent cluster screenshots captured successfully!');
  } catch (err) {
    console.error('Error during run:', err);
    chrome.kill();
  }
}

run();
