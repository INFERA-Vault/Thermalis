import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9245;

async function run() {
  console.log('🚀 Running Visual Cluster Translucency Verification...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-clusters-vis'
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

    // Wait for loader transition to complete
    await new Promise(r => setTimeout(r, 4000));

    // Ensure map is centered over active cluster areas and timeline is set to latest (ALL)
    await send('Runtime.evaluate', {
      expression: `
        if (window.__map) {
          window.__map.flyTo({ center: [78.9629, 20.5937], zoom: 4.5 });
        }
      `
    });
    await new Promise(r => setTimeout(r, 1500));

    // 1. Natural Basemap: Large Red (188), Orange (27, 42, 13) & Amber (3, 4, 6) Translucent Clusters
    console.log('📸 1. Capturing Natural Basemap with translucent red, orange & amber clusters...');
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_natural_subcontinent.png', Buffer.from(shot.result.data, 'base64'));

    // 2. Zoom in closer to show cluster translucency over land details (zoom 6.5)
    console.log('2. Zooming in to 6.5 over central clusters...');
    await send('Runtime.evaluate', {
      expression: `
        if (window.__map) {
          window.__map.flyTo({ center: [77.5, 23.0], zoom: 6.5 });
        }
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    console.log('📸 2. Capturing close-up of translucent clusters showing underlying terrain...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_closeup_terrain.png', Buffer.from(shot.result.data, 'base64'));

    // 3. Zoom into local cluster expansion / individual detections (zoom 10.5)
    console.log('3. Zooming to local level (zoom 10.5) for unclustered points...');
    await send('Runtime.evaluate', {
      expression: `
        if (window.__map) {
          window.__map.flyTo({ center: [77.5, 23.0], zoom: 10.5 });
        }
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    console.log('📸 3. Capturing individual detections and spider legs...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_local_unclustered.png', Buffer.from(shot.result.data, 'base64'));

    // 4. Switch Basemap to Thermal IR (at zoom 4.5)
    console.log('4. Switching to Thermal IR Basemap...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Thermal');
        if (btn) btn.click();
        if (window.__map) window.__map.flyTo({ center: [78.9629, 20.5937], zoom: 4.5 });
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    console.log('📸 4. Capturing Thermal IR Basemap with translucent clusters...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_thermal_subcontinent.png', Buffer.from(shot.result.data, 'base64'));

    // 5. Switch Basemap to Dark GIS (at zoom 4.5)
    console.log('5. Switching to Dark GIS Basemap...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Dark');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    console.log('📸 5. Capturing Dark GIS Basemap with translucent clusters...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_dark_subcontinent.png', Buffer.from(shot.result.data, 'base64'));

    // 6. Switch back to Natural
    console.log('6. Switching back to Natural Basemap...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Natural');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    console.log('📸 6. Capturing Natural Basemap restoration...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_natural_restored.png', Buffer.from(shot.result.data, 'base64'));

    ws.close();
    chrome.kill();
    console.log('✅ Visual verification run complete!');
  } catch (err) {
    console.error('Error during visual verification:', err);
    chrome.kill();
  }
}

run();
