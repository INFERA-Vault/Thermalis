import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9250;

async function run() {
  console.log('🚀 Capturing High-Detail Screenshots of Translucent Clusters over Hotspots...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-hotspots'
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

    // Wait for loader transition (4.2s)
    await new Promise(r => setTimeout(r, 4200));

    // 1. Regional View over Northern Hotspot Clusters (zoom 5.5, center [74.5, 32.5])
    console.log('📸 1. Capturing Regional View over Hotspots (Zoom 5.5 on Natural Basemap)...');
    await send('Runtime.evaluate', {
      expression: `
        if (window.__map) {
          window.__map.flyTo({ center: [74.5, 32.5], zoom: 5.5 });
        }
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_hotspots_regional_natural.png', Buffer.from(shot.result.data, 'base64'));

    // 2. Medium Zoom (Zoom 7.5 showing cluster breakdown and terrain visibility)
    console.log('📸 2. Capturing Zoom 7.5 Breakdown with Translucent Fills over Landscape...');
    await send('Runtime.evaluate', {
      expression: `
        if (window.__map) {
          window.__map.flyTo({ center: [74.2, 32.3], zoom: 7.5 });
        }
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_hotspots_zoom7_5.png', Buffer.from(shot.result.data, 'base64'));

    // 3. Local Zoom (Zoom 11.0 showing unclustered points, spider legs, facility icons)
    console.log('📸 3. Capturing Zoom 11.0 Local Detections & Spider Legs with transparent fills...');
    await send('Runtime.evaluate', {
      expression: `
        if (window.__map) {
          window.__map.flyTo({ center: [73.83, 32.18], zoom: 11.0 });
        }
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_hotspots_local_zoom11.png', Buffer.from(shot.result.data, 'base64'));

    // 4. Select an event to verify Selected Event Reticle
    console.log('📸 4. Selecting event and capturing Inspector + Golden Luminous Reticle...');
    await send('Runtime.evaluate', {
      expression: `
        const features = window.__map ? window.__map.queryRenderedFeatures(undefined, { layers: ['unclustered-point'] }) : [];
        if (features.length > 0) {
          const ev = features[0];
          const coords = ev.geometry.coordinates;
          window.__map.fire('click', {
            point: window.__map.project(coords),
            lngLat: { lng: coords[0], lat: coords[1] },
            features: [ev]
          });
        }
      `
    });
    await new Promise(r => setTimeout(r, 1200));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_selected_event.png', Buffer.from(shot.result.data, 'base64'));

    // 5. Switch to Thermal IR Basemap (Zoom 6.0 over hotspots)
    console.log('📸 5. Capturing Thermal IR Basemap with Translucent Clusters...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Thermal');
        if (btn) btn.click();
        if (window.__map) window.__map.flyTo({ center: [74.5, 32.5], zoom: 6.0 });
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_thermal_basemap.png', Buffer.from(shot.result.data, 'base64'));

    // 6. Switch to Dark GIS Basemap (Zoom 6.0 over hotspots)
    console.log('📸 6. Capturing Dark GIS Basemap with Translucent Clusters...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Dark');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_translucent_dark_basemap.png', Buffer.from(shot.result.data, 'base64'));

    ws.close();
    chrome.kill();
    console.log('✅ All hotspot screenshots successfully saved!');
  } catch (err) {
    console.error('Error during hotspot screenshot capture:', err);
    chrome.kill();
  }
}

run();
