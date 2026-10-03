import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9230;

async function run() {
  console.log('🚀 Launching headless Chrome for Thermalis Loading Screen verification...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-loader'
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

    // 1. Navigate to http://localhost:5173/
    console.log('1. Navigating to http://localhost:5173/ ...');
    await send('Page.navigate', { url: 'http://localhost:5173/' });

    // Step 2: Capture initial particle assembly (0.8s into loading)
    await new Promise(r => setTimeout(r, 800));
    console.log('2. Capturing assembling particle state at 0.8s...');
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_loader_assembling.png', Buffer.from(shot.result.data, 'base64'));

    // Step 3: Check status text in DOM
    const evalStatus1 = await send('Runtime.evaluate', {
      expression: `document.body.innerText`
    });
    console.log('Status text at 0.8s:\n', evalStatus1.result?.value?.substring(0, 200));

    // Step 4: Capture ready state (at 2.4s)
    await new Promise(r => setTimeout(r, 1600)); // Total 2.4s
    console.log('3. Capturing assembled logo & THERMALIS READY state at 2.4s...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_loader_ready.png', Buffer.from(shot.result.data, 'base64'));

    // Step 5: Wait for smooth fade-out and full dashboard transition (at 4.0s)
    await new Promise(r => setTimeout(r, 1600)); // Total 4.0s
    console.log('4. Capturing transitioned live dashboard at 4.0s...');
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_dashboard_after_loader.png', Buffer.from(shot.result.data, 'base64'));

    // Step 6: Verify map diagnostic and FIRMS data presence
    const diag = await send('Runtime.evaluate', {
      expression: `window.__thermoDiagnostic ? window.__thermoDiagnostic() : 'No diagnostic'`,
      returnByValue: true
    });
    console.log('Map Diagnostic after loader exit:', JSON.stringify(diag.result?.value, null, 2));

    // Step 7: Test responsive viewports
    const viewports = [
      { width: 1600, height: 900, name: '1600x900' },
      { width: 1366, height: 768, name: '1366x768' },
      { width: 1280, height: 720, name: '1280x720' }
    ];

    for (const vp of viewports) {
      console.log(`5. Testing viewport ${vp.name} ...`);
      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: false
      });
      // Refresh page to observe loader in this resolution
      await send('Page.navigate', { url: 'http://localhost:5173/' });
      await new Promise(r => setTimeout(r, 1200));
      shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`screenshot_loader_${vp.name}.png`, Buffer.from(shot.result.data, 'base64'));
      await new Promise(r => setTimeout(r, 2800)); // Wait for transition
    }

    console.log('Console logs captured during test:');
    consoleLogs.forEach(l => console.log('  ', l));

    ws.close();
    chrome.kill();
    console.log('🎉 Verification completed successfully!');
  } catch (err) {
    console.error('Verification error:', err);
    chrome.kill();
  }
}

run();
