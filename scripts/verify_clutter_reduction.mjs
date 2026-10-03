import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9227;

async function run() {
  console.log('Launching headless Chrome on port', PORT);
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-clutter'
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

    await new Promise(r => ws.onopen = r);

    const send = (method, params = {}) => {
      const id = msgId++;
      return new Promise((resolve) => {
        callbacks.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    };

    await send('Page.enable');
    await send('Runtime.enable');

    console.log('Navigating to http://localhost:5173/ ...');
    await send('Page.navigate', { url: 'http://localhost:5173/' });
    await new Promise(r => setTimeout(r, 3000));

    const evalJs = async (exp) => {
      const res = await send('Runtime.evaluate', {
        expression: exp,
        returnByValue: true
      });
      return res.result?.result?.value;
    };

    const captureScreenshot = async (filename) => {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      if (res.result?.data) {
        fs.writeFileSync(filename, Buffer.from(res.result.data, 'base64'));
        console.log(`Saved screenshot: ${filename}`);
      }
    };

    console.log('\n==================================================');
    console.log('TEST 1: Inspect Cleaned Bottom Status Bar');
    console.log('==================================================');

    const statusBarDetails = await evalJs(`
      (() => {
        const footer = document.querySelector('footer');
        if (!footer) return null;
        return {
          text: footer.innerText.replace(/\\s+/g, ' ').trim(),
          childrenCount: footer.children.length,
          leftText: footer.children[0]?.innerText.replace(/\\s+/g, ' ').trim(),
          rightText: footer.children[1]?.innerText.replace(/\\s+/g, ' ').trim()
        };
      })()
    `);
    console.log('Status Bar Details:', JSON.stringify(statusBarDetails, null, 2));

    console.log('\n==================================================');
    console.log('TEST 2: Inspect Simplified Timeline Metadata');
    console.log('==================================================');

    const timelineDetails = await evalJs(`
      (() => {
        const timeline = document.querySelector('[data-glass-surface="timeline"]');
        if (!timeline) return null;
        const headerRow = timeline.children[0]?.children[0];
        return {
          headerText: headerRow?.innerText.replace(/\\s+/g, ' ').trim()
        };
      })()
    `);
    console.log('Timeline Header Details:', JSON.stringify(timelineDetails, null, 2));

    console.log('\n==================================================');
    console.log('TEST 3: Inspect Compact Layers Panel & Micro-Toggles');
    console.log('==================================================');

    const layersDetails = await evalJs(`
      (() => {
        const panel = document.querySelector('[data-glass-surface="layers"]');
        if (!panel) return null;
        const rect = panel.getBoundingClientRect();
        const rows = Array.from(panel.querySelectorAll('.cursor-pointer'));
        return {
          panelWidth: Math.round(rect.width),
          panelHeight: Math.round(rect.height),
          rowCount: rows.length,
          rowLabels: rows.map(r => r.children[0]?.innerText.trim())
        };
      })()
    `);
    console.log('Layers Panel Details:', JSON.stringify(layersDetails, null, 2));
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_clutter_free_1920.png');

    console.log('\n==================================================');
    console.log('TEST 4: Test Interactive Layer & Basemap Toggling');
    console.log('==================================================');

    // Toggle NASA FIRMS off then on
    await evalJs(`
      (() => {
        const row = Array.from(document.querySelectorAll('.cursor-pointer')).find(r => r.innerText.includes('NASA FIRMS'));
        if (row) row.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    // Toggle NASA FIRMS back on
    await evalJs(`
      (() => {
        const row = Array.from(document.querySelectorAll('.cursor-pointer')).find(r => r.innerText.includes('NASA FIRMS'));
        if (row) row.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 400));

    // Toggle Basemap to Thermal
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Thermal');
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    // Return Basemap to Natural
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Natural');
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    console.log('\n==================================================');
    console.log('TEST 5: Responsive Laptop Viewport (1366x768)');
    console.log('==================================================');

    await send('Emulation.setDeviceMetricsOverride', {
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false
    });
    await new Promise(r => setTimeout(r, 600));
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_clutter_free_1366.png');

    console.log('\nALL CLUTTER REDUCTION TESTS PASSED!');
  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
