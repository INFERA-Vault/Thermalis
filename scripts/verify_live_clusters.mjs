import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9255;

async function run() {
  console.log('🚀 Running Live Clusters Diagnostic & Screenshot Capture...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-live-diag'
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

    // Get diagnostic
    let diag = await send('Runtime.evaluate', {
      expression: `window.__thermoDiagnostic ? window.__thermoDiagnostic() : null`,
      returnByValue: true
    });
    console.log('Initial Map Diagnostic:', JSON.stringify(diag.result?.value, null, 2));

    // Fly to India subcontinent where the clusters are distributed
    await send('Runtime.evaluate', {
      expression: `if (window.__map) window.__map.flyTo({ center: [78.9629, 22.0], zoom: 4.8 });`
    });
    await new Promise(r => setTimeout(r, 1500));

    diag = await send('Runtime.evaluate', {
      expression: `window.__thermoDiagnostic ? window.__thermoDiagnostic() : null`,
      returnByValue: true
    });
    console.log('Subcontinent Map Diagnostic:', JSON.stringify(diag.result?.value, null, 2));

    // 1. Natural Basemap
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_natural_verified.png', Buffer.from(shot.result.data, 'base64'));

    // 2. Switch to Thermal Basemap
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Thermal');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_thermal_verified.png', Buffer.from(shot.result.data, 'base64'));

    // 3. Switch to Dark Basemap
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Dark');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_dark_verified.png', Buffer.from(shot.result.data, 'base64'));

    // 4. Zoom in to a cluster (Zoom 7.5 over Northern cluster)
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Natural');
        if (btn) btn.click();
        if (window.__map) window.__map.flyTo({ center: [75.0, 32.0], zoom: 7.5 });
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_clusters_zoom7_5_verified.png', Buffer.from(shot.result.data, 'base64'));

    ws.close();
    chrome.kill();
    console.log('✅ Diagnostic run completed!');
  } catch (err) {
    console.error('Error:', err);
    chrome.kill();
  }
}

run();
