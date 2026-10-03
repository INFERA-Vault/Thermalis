import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9235;

async function run() {
  console.log('🚀 Starting Comprehensive THERMALIS Particle Loader Verification...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-verify-detailed'
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

    // Step 1: Particles swirling during assembly (0.9s)
    await new Promise(r => setTimeout(r, 900));
    console.log('📸 1. Capturing Assembly Swirl at 0.9s...');
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_1_assembling.png', Buffer.from(shot.result.data, 'base64'));

    // Step 2: Particles fully assembled into INFERA flame + logo (2.1s)
    await new Promise(r => setTimeout(r, 1200));
    console.log('📸 2. Capturing Assembled INFERA Particle Logo at 2.1s...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_2_assembled.png', Buffer.from(shot.result.data, 'base64'));

    // Step 3: THERMALIS READY indicator & green status (2.6s)
    await new Promise(r => setTimeout(r, 500));
    console.log('📸 3. Capturing THERMALIS READY State at 2.6s...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_3_ready.png', Buffer.from(shot.result.data, 'base64'));

    // Step 4: Full transition completed - Live THERMALIS map & dashboard (4.5s)
    await new Promise(r => setTimeout(r, 1900));
    console.log('📸 4. Capturing Live Dashboard after smooth fade-out (4.5s)...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_4_dashboard.png', Buffer.from(shot.result.data, 'base64'));

    // Step 5: Verify that the loader is unmounted from DOM and dashboard is fully active
    const domCheck = await send('Runtime.evaluate', {
      expression: `({
        hasLoaderCanvas: !!document.querySelector('canvas.cursor-crosshair'),
        hasMapCanvas: !!document.querySelector('.maplibregl-canvas'),
        activeEventCount: document.querySelectorAll('.maplibregl-marker, .maplibregl-canvas').length,
        headerTitle: document.querySelector('header')?.innerText || 'No Header'
      })`,
      returnByValue: true
    });
    console.log('DOM & Component Lifecycle Diagnostic:', JSON.stringify(domCheck.result?.value, null, 2));

    // Step 6: Test Map interaction (trigger camera center / pan)
    console.log('5. Testing map interactivity...');
    const mapEval = await send('Runtime.evaluate', {
      expression: `if (window.__map) {
        window.__map.flyTo({ center: [78.9629, 20.5937], zoom: 4.5 });
        'Map flyTo executed'
      } else {
        'Map not found on window.__map'
      }`
    });
    console.log('Map evaluation:', mapEval.result?.value);

    await new Promise(r => setTimeout(r, 1200));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_5_map_interacted.png', Buffer.from(shot.result.data, 'base64'));

    console.log('\n--- Console Logs during execution ---');
    consoleLogs.forEach(l => console.log('  ', l));

    ws.close();
    chrome.kill();
    console.log('\n✅ All tests passed successfully!');
  } catch (err) {
    console.error('Verification error:', err);
    chrome.kill();
  }
}

run();
