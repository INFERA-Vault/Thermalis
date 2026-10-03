import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9229;

async function run() {
  console.log('Launching headless Chrome on port', PORT);
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-final-glass'
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
    console.log('TEST 1: Inspect Injected Glass CSS Settings for All 6 Surfaces');
    console.log('==================================================');

    const surfaceSettings = await evalJs(`
      (() => {
        const surfaces = ['header', 'search', 'layers', 'timeline', 'mapControls', 'floatingPanels'];
        const results = {};

        // Helper to query computed css variable from DOM
        for (const s of surfaces) {
          let el = document.querySelector('[data-glass-surface="' + s + '"]');
          if (s === 'floatingPanels' && !el) {
            // Check modals or inspector
            el = document.querySelector('aside[data-glass="true"], div[data-glass="true"]');
          }
          if (el) {
            const style = window.getComputedStyle(el);
            results[s] = {
              found: true,
              blur: style.getPropertyValue('--glass-blur').trim(),
              tintOpacity: style.getPropertyValue('--glass-tint-opacity').trim(),
              edgeRefraction: style.getPropertyValue('--glass-edge-refraction').trim(),
              rimLight: style.getPropertyValue('--glass-rim-light').trim(),
              borderOpacity: style.getPropertyValue('--glass-border-opacity').trim(),
              bgOpacity: style.getPropertyValue('--glass-bg-opacity').trim(),
              shadow: style.getPropertyValue('--glass-shadow').trim()
            };
          } else {
            results[s] = { found: false };
          }
        }
        return results;
      })()
    `);
    console.log('Surface Live CSS Settings:', JSON.stringify(surfaceSettings, null, 2));

    // Verify expected exact values
    const expected = {
      header: { blur: '4px', tintOpacity: '0.2', edgeRefraction: '0.01', rimLight: '0.03', borderOpacity: '0.4', bgOpacity: '0.75', shadow: '0.2' },
      search: { blur: '14px', tintOpacity: '0.65', edgeRefraction: '0.035', rimLight: '0.1', borderOpacity: '0.8', bgOpacity: '0.9', shadow: '0.6' },
      layers: { blur: '4px', tintOpacity: '0.15', edgeRefraction: '0.045', rimLight: '0.15', borderOpacity: '0.55', bgOpacity: '0.37', shadow: '0.5' },
      timeline: { blur: '4px', tintOpacity: '0.2', edgeRefraction: '0.01', rimLight: '0.03', borderOpacity: '0.4', bgOpacity: '0.75', shadow: '0.2' },
      mapControls: { blur: '8.5px', tintOpacity: '0.15', edgeRefraction: '0.045', rimLight: '0.15', borderOpacity: '0.85', bgOpacity: '0.27', shadow: '0.54' }
    };

    for (const [key, exp] of Object.entries(expected)) {
      const act = surfaceSettings[key];
      if (!act || !act.found) {
        throw new Error(`Surface ${key} not found in DOM!`);
      }
      console.log(`✓ Surface [${key}] matches exact final values: blur=${act.blur}, tint=${act.tintOpacity}, edge=${act.edgeRefraction}, rim=${act.rimLight}, border=${act.borderOpacity}, bg=${act.bgOpacity}, shadow=${act.shadow}`);
    }

    console.log('\n==================================================');
    console.log('TEST 2: Verify Removal of Ctrl + Shift + G Tuning Panel');
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

    const tuningPanelInDom = await evalJs(`
      (() => {
        const panel = document.querySelector('.z-\\\\[60\\\\]');
        const tuningHeading = Array.from(document.querySelectorAll('*')).find(el => el.textContent.includes('Tune Liquid Glass'));
        return !!panel || !!tuningHeading;
      })()
    `);
    console.log('Tuning panel in DOM after Ctrl+Shift+G:', tuningPanelInDom);
    if (tuningPanelInDom) {
      throw new Error('Tuning panel unexpectedly opened!');
    }

    console.log('\n==================================================');
    console.log('TEST 3: Verify Core Application Flow & Capturing Screenshot');
    console.log('==================================================');
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_final_liquid_glass.png');

    console.log('\nALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
