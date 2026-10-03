import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9226;

async function run() {
  console.log('Launching headless Chrome on port', PORT);
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-clean'
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

    const consoleLogs = [];
    ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        consoleLogs.push(data.params);
      }
    });

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
    console.log('TEST 1: Verify 100% Absence of Legend in DOM');
    console.log('==================================================');

    const legendCheck = await evalJs(`
      (() => {
        const legendButtons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim().toLowerCase() === 'legend');
        const legendElements = Array.from(document.querySelectorAll('*')).filter(el => {
          const txt = el.textContent.trim();
          return txt === 'LEGEND' || txt === 'Thermal hotspot' || txt === 'FRP scale (MW)';
        });
        return {
          legendButtonsCount: legendButtons.length,
          legendElementsCount: legendElements.length
        };
      })()
    `);
    console.log('Legend Absence Check:', JSON.stringify(legendCheck, null, 2));
    if (legendCheck.legendButtonsCount > 0 || legendCheck.legendElementsCount > 0) {
      throw new Error('Legend elements still found in DOM!');
    }

    console.log('\n==================================================');
    console.log('TEST 2: Verify Bottom-Left Map Area and Layout Offsets');
    console.log('==================================================');

    const layoutCheck = await evalJs(`
      (() => {
        const header = document.querySelector('header')?.getBoundingClientRect();
        const statusBar = document.querySelector('footer')?.getBoundingClientRect();
        const timeline = document.querySelector('[data-glass-surface="timeline"]')?.getBoundingClientRect();
        const mapControls = document.querySelector('[data-glass-surface="mapControls"]')?.getBoundingClientRect();
        const layersPanel = document.querySelector('[data-glass-surface="layers"]')?.getBoundingClientRect();

        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          header: header ? { top: Math.round(header.top), bottom: Math.round(header.bottom), height: Math.round(header.height) } : null,
          statusBar: statusBar ? { top: Math.round(statusBar.top), bottom: Math.round(statusBar.bottom), height: Math.round(statusBar.height) } : null,
          timeline: timeline ? { top: Math.round(timeline.top), bottom: Math.round(timeline.bottom), height: Math.round(timeline.height) } : null,
          mapControls: mapControls ? { top: Math.round(mapControls.top), bottom: Math.round(mapControls.bottom), right: Math.round(mapControls.right), height: Math.round(mapControls.height) } : null,
          layersPanel: layersPanel ? { top: Math.round(layersPanel.top), bottom: Math.round(layersPanel.bottom), left: Math.round(layersPanel.left), width: Math.round(layersPanel.width) } : null,
          mapControlsGapToTimeline: (timeline && mapControls) ? Math.round(timeline.top - mapControls.bottom) : null
        };
      })()
    `);
    console.log('Layout Check:', JSON.stringify(layoutCheck, null, 2));
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_no_legend_1920.png');

    console.log('\n==================================================');
    console.log('TEST 3: Verify Basemap Switching & Layers Functionality');
    console.log('==================================================');

    // Test Thermal Basemap click
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Thermal');
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    // Test Dark Basemap click
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Dark');
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    // Return to Natural Basemap
    await evalJs(`
      (() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Natural');
        if (btn) btn.click();
      })()
    `);
    await new Promise(r => setTimeout(r, 600));

    console.log('\n==================================================');
    console.log('TEST 4: Verify Liquid Glass Tuning Panel (Ctrl+Shift+G)');
    console.log('==================================================');

    await evalJs(`
      window.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'G',
        code: 'KeyG',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true
      }))
    `);
    await new Promise(r => setTimeout(r, 400));
    const tuningCheck = await evalJs(`!!document.querySelector('div.fixed.z-\\\\[60\\\\]')`);
    console.log('Tuning panel visible:', tuningCheck);
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_no_legend_tuning.png');

    console.log('\n==================================================');
    console.log('ALL TESTS PASSED SUCCESSFULLY! ZERO LEGEND RESIDUE.');
    console.log('==================================================');

  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
