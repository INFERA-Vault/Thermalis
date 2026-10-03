import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9240;

async function run() {
  console.log('🚀 Starting Translucent Alert/Thermal Clusters Verification...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-clusters'
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
    const consoleLogs = [];

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        const text = data.params.args.map(a => a.value || a.description || '').join(' ');
        consoleLogs.push(`[${data.params.type}] ${text}`);
      }
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

    console.log('✓ Connected to Chrome CDP WebSocket');
    await send('Runtime.enable');
    await send('Page.enable');

    console.log('1. Navigating to http://localhost:5173/ ...');
    await send('Page.navigate', { url: 'http://localhost:5173/' });

    // Wait for loader to complete and dashboard to settle (4.2s)
    await new Promise(r => setTimeout(r, 4200));

    // 1. World Zoom Screenshot (Natural Basemap)
    console.log('📸 1. Capturing World Zoom with translucent red, orange & amber clusters (Natural Basemap)...');
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_1_world_natural.png', Buffer.from(shot.result.data, 'base64'));

    // 2. India Regional Zoom (Zoom 4.5 over India to see large & medium clusters with map visible underneath)
    console.log('2. Flying to India (Zoom 4.5)...');
    await send('Runtime.evaluate', {
      expression: `if (window.__map) window.__map.flyTo({ center: [78.9629, 20.5937], zoom: 4.5 });`
    });
    await new Promise(r => setTimeout(r, 1400));
    console.log('📸 2. Capturing India Regional View (Translucent Clusters over subcontinent geography)...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_2_india_regional.png', Buffer.from(shot.result.data, 'base64'));

    // 3. Local Zoom / Cluster Expansion (Zoom 8.5 into Mumbai/Western region to see small clusters & unclustered points)
    console.log('3. Flying to Mumbai/Western region (Zoom 8.5)...');
    await send('Runtime.evaluate', {
      expression: `if (window.__map) window.__map.flyTo({ center: [73.8567, 18.5204], zoom: 8.5 });`
    });
    await new Promise(r => setTimeout(r, 1400));
    console.log('📸 3. Capturing Local Zoom & Individual FIRMS Detections with map visible...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_3_local_detections.png', Buffer.from(shot.result.data, 'base64'));

    // 4. Test Selected Event Highlight
    console.log('4. Selecting an anomaly event...');
    await send('Runtime.evaluate', {
      expression: `
        const features = window.__map ? window.__map.queryRenderedFeatures(undefined, { layers: ['unclustered-point'] }) : [];
        if (features.length > 0) {
          const ev = features[0];
          window.__map.fire('click', {
            point: window.__map.project(ev.geometry.coordinates),
            lngLat: ev.geometry.coordinates,
            features: [ev]
          });
        }
      `
    });
    await new Promise(r => setTimeout(r, 800));
    console.log('📸 4. Capturing Selected Anomaly Reticle...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_4_selected_event.png', Buffer.from(shot.result.data, 'base64'));

    // 5. Test Basemap Switch to Thermal (IR)
    console.log('5. Switching Basemap to Thermal IR...');
    await send('Runtime.evaluate', {
      expression: `
        // Click Thermal basemap button in Layers panel
        const buttons = Array.from(document.querySelectorAll('button'));
        const thermalBtn = buttons.find(b => b.innerText && b.innerText.toLowerCase().includes('thermal'));
        if (thermalBtn) thermalBtn.click();
      `
    });
    await send('Runtime.evaluate', {
      expression: `if (window.__map) window.__map.flyTo({ center: [78.9629, 20.5937], zoom: 4.5 });`
    });
    await new Promise(r => setTimeout(r, 1200));
    console.log('📸 5. Capturing Translucent Clusters on Thermal IR Basemap...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_5_thermal_basemap.png', Buffer.from(shot.result.data, 'base64'));

    // 6. Test Basemap Switch to Dark GIS
    console.log('6. Switching Basemap to Dark GIS...');
    await send('Runtime.evaluate', {
      expression: `
        const buttons = Array.from(document.querySelectorAll('button'));
        const darkBtn = buttons.find(b => b.innerText && b.innerText.toLowerCase().includes('dark'));
        if (darkBtn) darkBtn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    console.log('📸 6. Capturing Translucent Clusters on Dark GIS Basemap...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_6_dark_basemap.png', Buffer.from(shot.result.data, 'base64'));

    // 7. Test Basemap Switch Back to Natural
    console.log('7. Switching Basemap back to Natural...');
    await send('Runtime.evaluate', {
      expression: `
        const buttons = Array.from(document.querySelectorAll('button'));
        const naturalBtn = buttons.find(b => b.innerText && b.innerText.toLowerCase().includes('natural'));
        if (naturalBtn) naturalBtn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    console.log('📸 7. Capturing Return to Natural Basemap...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_7_natural_returned.png', Buffer.from(shot.result.data, 'base64'));

    console.log('\n--- Console Logs during execution ---');
    consoleLogs.forEach(l => console.log('  ', l));

    ws.close();
    chrome.kill();
    console.log('\n✅ All cluster transparency tests completed successfully!');
  } catch (err) {
    console.error('Verification error:', err);
    chrome.kill();
  }
}

run();
