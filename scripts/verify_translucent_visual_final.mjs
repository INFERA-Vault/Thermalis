import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9260;

async function run() {
  console.log('🚀 Starting Final Translucent Clusters Visual Verification...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-final-translucent'
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

    console.log('1. Navigating to THERMALIS frontend (http://localhost:5173/)...');
    await send('Page.navigate', { url: 'http://localhost:5173/' });

    // Wait until loading screen has completely exited (poll up to 10s)
    console.log('2. Waiting for loading screen animation to complete and unmount...');
    let loaded = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const res = await send('Runtime.evaluate', {
        expression: `window.__map !== undefined && !document.querySelector('.z-50')`,
        returnByValue: true
      });
      if (res.result?.value) {
        loaded = true;
        console.log(`✅ App fully loaded and loading screen unmounted at ${(i + 1) * 500}ms`);
        break;
      }
    }

    if (!loaded) {
      console.log('Waiting additional 3 seconds as fallback...');
      await new Promise(r => setTimeout(r, 3000));
    }

    // Capture MapLibre Layer Paint Properties to verify exact opacity values
    console.log('3. Inspecting MapLibre layer paint properties...');
    const styleInspect = await send('Runtime.evaluate', {
      expression: `(() => {
        if (!window.__map) return null;
        const map = window.__map;
        return {
          clusterCircleOpacity: map.getPaintProperty('clusters-circle', 'circle-opacity'),
          clusterCircleStrokeWidth: map.getPaintProperty('clusters-circle', 'circle-stroke-width'),
          clusterCircleStrokeColor: map.getPaintProperty('clusters-circle', 'circle-stroke-color'),
          clusterCircleStrokeOpacity: map.getPaintProperty('clusters-circle', 'circle-stroke-opacity'),
          clusterCountColor: map.getPaintProperty('cluster-count', 'text-color'),
          clusterCountHalo: map.getPaintProperty('cluster-count', 'text-halo-color'),
          clusterCountHaloWidth: map.getPaintProperty('cluster-count', 'text-halo-width'),
          unclusteredOpacity: map.getPaintProperty('unclustered-point', 'circle-opacity'),
          unclusteredStrokeColor: map.getPaintProperty('unclustered-point', 'circle-stroke-color'),
          unclusteredStrokeOpacity: map.getPaintProperty('unclustered-point', 'circle-stroke-opacity'),
          selectedRingColor: map.getPaintProperty('selected-event-ring', 'circle-stroke-color'),
          selectedRingInnerGlow: map.getPaintProperty('selected-event-ring', 'circle-color')
        };
      })()`,
      returnByValue: true
    });
    console.log('Active MapLibre Layer Paint Diagnostics:', JSON.stringify(styleInspect.result?.value, null, 2));

    // Test 1: Subcontinent View (Natural Basemap)
    console.log('📸 Test 1: Capturing India/Regional Hotspot Clusters (Natural Basemap, Zoom 5.2)...');
    await send('Runtime.evaluate', {
      expression: `window.__map.flyTo({ center: [76.5, 30.0], zoom: 5.2, duration: 0 });`
    });
    await new Promise(r => setTimeout(r, 1500));
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_1_natural_subcontinent.png', Buffer.from(shot.result.data, 'base64'));

    // Test 2: Medium Regional Zoom (Breakdown into smaller clusters)
    console.log('📸 Test 2: Capturing Regional Zoom (Zoom 7.5 over Northern cluster cluster group)...');
    await send('Runtime.evaluate', {
      expression: `window.__map.flyTo({ center: [74.5, 32.2], zoom: 7.5, duration: 0 });`
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_2_natural_zoom7_5.png', Buffer.from(shot.result.data, 'base64'));

    // Test 3: High Zoom Unclustered Detections (Zoom 11.0)
    console.log('📸 Test 3: Capturing Local Zoom (Zoom 11.0 showing individual FIRMS detections)...');
    await send('Runtime.evaluate', {
      expression: `window.__map.flyTo({ center: [73.83, 32.18], zoom: 11.0, duration: 0 });`
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_3_individual_detections.png', Buffer.from(shot.result.data, 'base64'));

    // Test 4: Basemap Toggle -> Thermal IR Basemap
    console.log('📸 Test 4: Switching Basemap to Thermal and verifying translucent cluster rendering...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Thermal');
        if (btn) btn.click();
        window.__map.flyTo({ center: [76.5, 30.0], zoom: 5.2, duration: 0 });
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_4_thermal_basemap.png', Buffer.from(shot.result.data, 'base64'));

    // Test 5: Basemap Toggle -> Dark GIS Basemap
    console.log('📸 Test 5: Switching Basemap to Dark GIS and verifying translucent cluster rendering...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Dark');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_5_dark_basemap.png', Buffer.from(shot.result.data, 'base64'));

    // Test 6: Cycle back to Natural Basemap
    console.log('📸 Test 6: Switching back to Natural Basemap...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Natural');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_6_natural_basemap_restored.png', Buffer.from(shot.result.data, 'base64'));

    ws.close();
    chrome.kill();
    console.log('🎉 Verification suite finished successfully!');
  } catch (err) {
    console.error('Error during verification:', err);
    chrome.kill();
  }
}

run();
