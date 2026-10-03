import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9228;

async function run() {
  console.log('Launching headless Chrome on port', PORT);
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-test-profile-playhead'
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

    const inspectPlayhead = async (desc) => {
      const data = await evalJs(`
        (() => {
          const timeline = document.querySelector('[data-glass-surface="timeline"]');
          const headerRow = timeline ? timeline.querySelector('.text-xs') : null;
          const slider = document.querySelector('input[type="range"]');
          const rail = slider ? slider.parentElement : null;
          const needleContainer = rail ? rail.querySelector('.z-15') : null;
          const needleLine = needleContainer ? needleContainer.children[0] : null;
          const thumbHandle = needleContainer ? needleContainer.children[1] : null;

          const hBox = headerRow ? headerRow.getBoundingClientRect() : null;
          const lBox = needleLine ? needleLine.getBoundingClientRect() : null;
          const thBox = thumbHandle ? thumbHandle.getBoundingClientRect() : null;
          const rBox = rail ? rail.getBoundingClientRect() : null;

          return {
            needleLine: lBox ? {
              top: Math.round(lBox.top),
              bottom: Math.round(lBox.bottom),
              height: Math.round(lBox.height),
              left: Math.round(lBox.left)
            } : null,
            thumbHandle: thBox ? {
              top: Math.round(thBox.top),
              bottom: Math.round(thBox.bottom),
              center: Math.round((thBox.top + thBox.bottom) / 2),
              left: Math.round(thBox.left)
            } : null,
            rail: rBox ? {
              top: Math.round(rBox.top),
              bottom: Math.round(rBox.bottom),
              center: Math.round((rBox.top + rBox.bottom) / 2)
            } : null,
            boundsCheck: {
              lineTopBelowHeaderBottom: (lBox && hBox) ? lBox.top >= hBox.bottom : false,
              gapLineTopToHeaderBottom: (lBox && hBox) ? Math.round(lBox.top - hBox.bottom) : null,
              thumbCenteredOnRail: (thBox && rBox) ? Math.abs(((thBox.top + thBox.bottom) / 2) - ((rBox.top + rBox.bottom) / 2)) <= 2 : false
            }
          };
        })()
      `);
      console.log(`\n--- Playhead Check: ${desc} ---`);
      console.log(JSON.stringify(data, null, 2));
      return data;
    };

    console.log('\n==================================================');
    console.log('TEST 1: Playhead at End (Default State)');
    console.log('==================================================');
    let res = await inspectPlayhead('End of Timeline (Max timestamp)');
    if (!res.boundsCheck.lineTopBelowHeaderBottom) throw new Error('Line extends into header!');
    if (!res.boundsCheck.thumbCenteredOnRail) throw new Error('Thumb handle not centered!');
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_playhead_end.png');

    console.log('\n==================================================');
    console.log('TEST 2: Move Scrubber to Start (Reset Button)');
    console.log('==================================================');
    await evalJs(`document.querySelector('button[title*="Reset"]')?.click()`);
    await new Promise(r => setTimeout(r, 400));
    res = await inspectPlayhead('Start of Timeline (Min timestamp)');
    if (!res.boundsCheck.lineTopBelowHeaderBottom) throw new Error('Line extends into header!');
    if (!res.boundsCheck.thumbCenteredOnRail) throw new Error('Thumb handle not centered!');
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_playhead_start.png');

    console.log('\n==================================================');
    console.log('TEST 3: Move Scrubber to Middle (Slider Drag)');
    console.log('==================================================');
    await evalJs(`
      (() => {
        const slider = document.querySelector('input[type="range"]');
        if (slider) {
          const min = parseFloat(slider.min);
          const max = parseFloat(slider.max);
          slider.value = String((min + max) / 2);
          slider.dispatchEvent(new Event('change', { bubbles: true }));
        }
      })()
    `);
    await new Promise(r => setTimeout(r, 400));
    res = await inspectPlayhead('Middle of Timeline');
    if (!res.boundsCheck.lineTopBelowHeaderBottom) throw new Error('Line extends into header!');
    if (!res.boundsCheck.thumbCenteredOnRail) throw new Error('Thumb handle not centered!');
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_playhead_middle.png');

    console.log('\n==================================================');
    console.log('TEST 4: Test Playback Progression');
    console.log('==================================================');
    // Click Play
    await evalJs(`document.querySelector('button[title*="Play"]')?.click()`);
    await new Promise(r => setTimeout(r, 1200));
    res = await inspectPlayhead('Playing in Progress');
    if (!res.boundsCheck.lineTopBelowHeaderBottom) throw new Error('Line extends into header during play!');
    await captureScreenshot('C:\\THERMALIS-PS162\\screenshot_playhead_playing.png');

    // Click Pause
    await evalJs(`document.querySelector('button[title*="Pause"]')?.click()`);
    await new Promise(r => setTimeout(r, 300));

    console.log('\nALL PLAYHEAD TESTS PASSED PERFECTLY!');
  } finally {
    chrome.kill();
  }
}

run().catch(console.error);
