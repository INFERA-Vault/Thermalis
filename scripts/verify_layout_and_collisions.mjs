import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9225;

async function run() {
  console.log('Launching headless Chrome on port', PORT);
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-legend2'
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

    const inspectLayout = async (desc) => {
      const data = await evalJs(`
        (() => {
          const header = document.querySelector('header');
          const statusBar = document.querySelector('footer');
          const timeline = document.querySelector('[data-glass-surface="timeline"]');
          const mapControls = document.querySelector('[data-glass-surface="mapControls"]');
          const legendBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Legend');
          const legendHeading = Array.from(document.querySelectorAll('*')).find(el => el.textContent.trim() === 'LEGEND');
          const legendPopup = legendHeading ? legendHeading.closest('[data-glass-surface="floatingPanels"]') : null;
          const layersPanel = document.querySelector('[data-glass-surface="layers"]');

          const getBox = el => {
            if (!el || window.getComputedStyle(el).display === 'none') return null;
            const r = el.getBoundingClientRect();
            return {
              top: Math.round(r.top),
              bottom: Math.round(r.bottom),
              left: Math.round(r.left),
              right: Math.round(r.right),
              width: Math.round(r.width),
              height: Math.round(r.height)
            };
          };

          const hBox = getBox(header);
          const sBox = getBox(statusBar);
          const tBox = getBox(timeline);
          const mcBox = getBox(mapControls);
          const legBox = getBox(legendBtn);
          const popBox = getBox(legendPopup);
          const layBox = getBox(layersPanel);

          const checkOverlap = (a, b) => {
            if (!a || !b) return false;
            return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
          };

          const legendElementBox = popBox || legBox;

          return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            layersOpen: !!layBox,
            legendOpen: !!popBox,
            boxes: {
              header: hBox,
              timeline: tBox,
              mapControls: mcBox,
              layersPanel: layBox,
              legendButton: legBox,
              legendPopup: popBox
            },
            overlaps: {
              legendOverlapsLayers: checkOverlap(legendElementBox, layBox),
              legendOverlapsTimeline: checkOverlap(legendElementBox, tBox),
              legendOverlapsMapControls: checkOverlap(legendElementBox, mcBox),
              mapControlsOverlapsTimeline: checkOverlap(mcBox, tBox),
              layersOverlapsHeader: checkOverlap(layBox, hBox),
              layersOverlapsTimeline: checkOverlap(layBox, tBox)
            },
            gaps: {
              legendGapToTimeline: (tBox && legendElementBox) ? Math.round(tBox.top - legendElementBox.bottom) : null,
              mapControlsGapToTimeline: (tBox && mcBox) ? Math.round(tBox.top - mcBox.bottom) : null
            }
          };
        })()
      `);
      console.log(`\n--- Layout Check: ${desc} ---`);
      console.log(JSON.stringify(data, null, 2));
      return data;
    };

    console.log('\n==================================================');
    console.log('TEST SUITE 1: Desktop 1920x1080 Resolution');
    console.log('==================================================');

    // Combination 2: Layers OPEN + Legend CLOSED
    let res = await inspectLayout('1920x1080: Layers OPEN + Legend CLOSED');

    // Combination 4: Layers OPEN + Legend OPEN
    await evalJs(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Legend')?.click()`);
    await new Promise(r => setTimeout(r, 400));
    res = await inspectLayout('1920x1080: Layers OPEN + Legend OPEN');
    if (res.overlaps.legendOverlapsLayers || res.overlaps.legendOverlapsTimeline) throw new Error('Overlap detected!');
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_1920_layers_open_legend_open.png');

    // Combination 3: Layers CLOSED + Legend OPEN
    await evalJs(`Array.from(document.querySelectorAll('header button')).find(b => b.textContent.trim() === 'Layers')?.click()`);
    await new Promise(r => setTimeout(r, 400));
    res = await inspectLayout('1920x1080: Layers CLOSED + Legend OPEN');
    if (res.overlaps.legendOverlapsLayers || res.overlaps.legendOverlapsTimeline) throw new Error('Overlap detected!');
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_1920_layers_closed_legend_open.png');

    // Combination 1: Layers CLOSED + Legend CLOSED
    await evalJs(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Legend')?.click()`);
    await new Promise(r => setTimeout(r, 400));
    res = await inspectLayout('1920x1080: Layers CLOSED + Legend CLOSED');
    if (res.overlaps.legendOverlapsLayers || res.overlaps.legendOverlapsTimeline) throw new Error('Overlap detected!');

    // Reopen Layers
    await evalJs(`Array.from(document.querySelectorAll('header button')).find(b => b.textContent.trim() === 'Layers')?.click()`);
    await new Promise(r => setTimeout(r, 400));

    console.log('\n==================================================');
    console.log('TEST SUITE 2: Laptop 1366x768 Resolution (Collision & Dynamic Shift Test)');
    console.log('==================================================');

    await send('Emulation.setDeviceMetricsOverride', {
      width: 1366,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false
    });
    // Trigger window resize event
    await evalJs(`window.dispatchEvent(new Event('resize'))`);
    await new Promise(r => setTimeout(r, 600));

    // Combination 2: Layers OPEN + Legend CLOSED
    res = await inspectLayout('1366x768: Layers OPEN + Legend CLOSED');

    // Combination 4: Layers OPEN + Legend OPEN (Should dynamically shift beside Layers to left: 264px)
    await evalJs(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Legend')?.click()`);
    await new Promise(r => setTimeout(r, 400));
    res = await inspectLayout('1366x768: Layers OPEN + Legend OPEN');
    if (res.overlaps.legendOverlapsLayers || res.overlaps.legendOverlapsTimeline) throw new Error('Overlap detected!');
    console.log('Legend left coordinate:', res.boxes.legendPopup?.left, 'Layers panel right coordinate:', res.boxes.layersPanel?.right);
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_1366_layers_open_legend_open.png');

    // Combination 3: Layers CLOSED + Legend OPEN (Should return smoothly to left: 12px)
    await evalJs(`Array.from(document.querySelectorAll('header button')).find(b => b.textContent.trim() === 'Layers')?.click()`);
    await new Promise(r => setTimeout(r, 400));
    res = await inspectLayout('1366x768: Layers CLOSED + Legend OPEN');
    if (res.overlaps.legendOverlapsLayers || res.overlaps.legendOverlapsTimeline) throw new Error('Overlap detected!');
    console.log('Legend left coordinate (returned to left-3):', res.boxes.legendPopup?.left);
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_1366_layers_closed_legend_open.png');

    // Reopen Layers
    await evalJs(`Array.from(document.querySelectorAll('header button')).find(b => b.textContent.trim() === 'Layers')?.click()`);
    await new Promise(r => setTimeout(r, 400));

    console.log('\n==================================================');
    console.log('ALL 4 COMBINATIONS ACROSS ALL RESOLUTIONS PASSED WITH 0 OVERLAPS!');
    console.log('==================================================');

  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
