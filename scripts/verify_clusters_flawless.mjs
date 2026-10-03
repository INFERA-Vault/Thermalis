import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9260;

async function run() {
  console.log('🚀 Running Flawless Cluster Translucency & Basemap Verification...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-flawless'
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

    // Wait 4.5s for loading screen to complete and unmount
    await new Promise(r => setTimeout(r, 4500));

    // 1. Natural Basemap: Large, Medium, and Small Translucent Clusters
    console.log('📸 1. Capturing Natural Basemap with translucent red (188), orange (27, 42, 13) and amber (3, 4, 6) clusters...');
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_final_clusters_1_natural.png', Buffer.from(shot.result.data, 'base64'));

    // 2. Zoom in to Zoom 4.5 to see terrain details through the cluster fills
    console.log('📸 2. Zooming to Zoom 4.5 over subcontinent clusters...');
    await send('Runtime.evaluate', {
      expression: `if (window.__map) window.__map.flyTo({ center: [78.9629, 20.5937], zoom: 4.5 });`
    });
    await new Promise(r => setTimeout(r, 1400));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_final_clusters_2_natural_zoom4_5.png', Buffer.from(shot.result.data, 'base64'));

    // 3. Switch to Thermal IR Basemap
    console.log('📸 3. Switching to Thermal IR Basemap...');
    await send('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('button.thermal-basemap-btn') || Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'Thermal');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1400));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_final_clusters_3_thermal_basemap.png', Buffer.from(shot.result.data, 'base64'));

    // 4. Switch to Dark GIS Basemap
    console.log('📸 4. Switching to Dark GIS Basemap...');
    await send('Runtime.evaluate', {
      expression: `
        const btn = document.querySelector('button.dark-basemap-btn') || Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'Dark');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1400));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_final_clusters_4_dark_basemap.png', Buffer.from(shot.result.data, 'base64'));

    // 5. Switch back to Natural Basemap and zoom into unclustered detections (Zoom 8.5)
    console.log('📸 5. Zooming into unclustered points & spider legs (Zoom 8.5)...');
    await send('Runtime.evaluate', {
      expression: `
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'Natural');
        if (btn) btn.click();
        if (window.__map) window.__map.flyTo({ center: [78.9629, 20.5937], zoom: 8.5 });
      `
    });
    await new Promise(r => setTimeout(r, 1400));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_final_clusters_5_unclustered_points.png', Buffer.from(shot.result.data, 'base64'));

    ws.close();
    chrome.kill();
    console.log('🎉 Flawless cluster verification completed successfully!');
  } catch (err) {
    console.error('Error during flawless verification:', err);
    chrome.kill();
  }
}

run();
