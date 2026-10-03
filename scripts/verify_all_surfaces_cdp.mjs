import { spawn } from 'child_process';
import http from 'http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9222;

async function run() {
  console.log('Launching headless Chrome on port', PORT);
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1440,900',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile'
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
    console.log('Target page WS URL:', page.webSocketDebuggerUrl);

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

    console.log('Enabling Page & Runtime domains...');
    await send('Page.enable');
    await send('Runtime.enable');

    console.log('Navigating to http://localhost:5173/ ...');
    await send('Page.navigate', { url: 'http://localhost:5173/' });

    await new Promise(r => setTimeout(r, 2500));

    console.log('\n=== TEST 1: Inspect 6 Target Surfaces in DOM ===');
    const surfaceCheck = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const surfaces = ['header', 'search', 'layers', 'timeline', 'mapControls', 'floatingPanels'];
          const results = {};
          for (const s of surfaces) {
            const el = document.querySelector('[data-glass-surface="' + s + '"]');
            if (el) {
              const rect = el.getBoundingClientRect();
              const style = window.getComputedStyle(el);
              results[s] = {
                found: true,
                tagName: el.tagName,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                backdropFilter: style.backdropFilter || style.webkitBackdropFilter || 'none',
                backgroundColor: style.backgroundColor,
                boxShadow: style.boxShadow,
                hasCanvas: !!el.querySelector('canvas.liquid-glass-canvas')
              };
            } else {
              results[s] = { found: false };
            }
          }
          return JSON.stringify(results, null, 2);
        })()
      `,
      returnByValue: true
    });

    console.log('Surfaces DOM status:\n', surfaceCheck.result?.result?.value || surfaceCheck);

    console.log('\n=== TEST 2: Trigger Ctrl+Shift+G to Open Tuning Panel ===');
    await send('Runtime.evaluate', {
      expression: `
        (() => {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'G',
            code: 'KeyG',
            shiftKey: true,
            ctrlKey: true,
            bubbles: true
          }));
        })()
      `
    });

    await new Promise(r => setTimeout(r, 600));

    const panelCheck = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const title = document.body.innerText.includes('Tune Liquid Glass');
          const sliders = document.querySelectorAll('input[type="range"]').length;
          return JSON.stringify({ panelOpen: title, sliderCount: sliders });
        })()
      `,
      returnByValue: true
    });

    console.log('Tuning Panel status after Ctrl+Shift+G:\n', panelCheck.result?.result?.value || panelCheck);

    console.log('\n=== TEST 3: Verify Independent Surface Tuning on Header & Search & Timeline ===');
    const liveTuningTest = await send('Runtime.evaluate', {
      expression: `
        (() => {
          const header = document.querySelector('[data-glass-surface="header"]');
          const search = document.querySelector('[data-glass-surface="search"]');
          const timeline = document.querySelector('[data-glass-surface="timeline"]');
          const layers = document.querySelector('[data-glass-surface="layers"]');

          return JSON.stringify({
            headerBlur: window.getComputedStyle(header).backdropFilter,
            searchBlur: window.getComputedStyle(search).backdropFilter,
            timelineBlur: window.getComputedStyle(timeline).backdropFilter,
            layersBlur: window.getComputedStyle(layers).backdropFilter
          }, null, 2);
        })()
      `,
      returnByValue: true
    });

    console.log('Live backdrop-filter compute results:\n', liveTuningTest.result?.result?.value || liveTuningTest);

    ws.close();
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    chrome.kill();
  }
}

run();
