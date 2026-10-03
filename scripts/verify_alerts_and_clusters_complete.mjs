import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9420;

async function run() {
  console.log('🚀 Running Complete Alerts & Translucent Clusters Verification Suite...');
  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-verify-complete'
  ]);

  await new Promise(r => setTimeout(r, 1500));

  try {
    const listRes = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${PORT}/json/list`, res => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
      });
    });
    const page = listRes.find(p => p.type === 'page') || listRes[0];
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 1;
    const cbs = new Map();

    ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.id && cbs.has(d.id)) { cbs.get(d.id)(d); cbs.delete(d.id); }
    };

    const send = (m, p = {}) => new Promise(r => { const id = msgId++; cbs.set(id, r); ws.send(JSON.stringify({id, method: m, params: p})); });
    await new Promise(r => { if (ws.readyState === 1) r(); else ws.onopen = r; });

    await send('Runtime.enable');
    await send('Page.enable');
    console.log('1. Navigating to http://localhost:5173/ ...');
    await send('Page.navigate', { url: 'http://localhost:5173/' });

    // Wait until map is ready and loading screen unmounted
    console.log('2. Waiting for loading screen transition and map readiness...');
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const test = await send('Runtime.evaluate', {
        expression: `!!window.__map && !document.querySelector('.z-50')`,
        returnByValue: true
      });
      if (test.result?.result?.value || test.result?.value) break;
    }
    await new Promise(r => setTimeout(r, 1000));

    // 1. World Zoom (Zoom ~1.9)
    console.log('📸 1. Capturing World View (Translucent Clusters 491, 119, 9 over India)...');
    let shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_complete_1_world.png', Buffer.from(shot.result.data, 'base64'));

    // 2. India Subcontinent Zoom (Zoom 4.8)
    console.log('📸 2. Capturing India Subcontinent View (Zoom 4.8)...');
    await send('Runtime.evaluate', {
      expression: `window.__map.flyTo({ center: [78.96, 22.0], zoom: 4.8, duration: 0 });`
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_complete_2_india_zoom4_8.png', Buffer.from(shot.result.data, 'base64'));

    // 3. Regional Breakdown (Zoom 7.5 over Northern cluster group)
    console.log('📸 3. Capturing Regional Breakdown (Zoom 7.5 showing cluster numbers and terrain through circles)...');
    await send('Runtime.evaluate', {
      expression: `window.__map.flyTo({ center: [74.5, 32.2], zoom: 7.5, duration: 0 });`
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_complete_3_regional_zoom7_5.png', Buffer.from(shot.result.data, 'base64'));

    // 4. Local Zoom (Zoom 11.5 with individual detections and spider legs)
    console.log('📸 4. Capturing Local Detections (Zoom 11.5 with individual translucent points)...');
    await send('Runtime.evaluate', {
      expression: `window.__map.flyTo({ center: [74.8955, 32.1891], zoom: 11.5, duration: 0 });`
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_complete_4_local_zoom11_5.png', Buffer.from(shot.result.data, 'base64'));

    // 5. Selected Event Inspection
    console.log('📸 5. Selecting event and capturing Inspector Panel + Luminous Reticle...');
    await send('Runtime.evaluate', {
      expression: `
        const pt = window.__map.project([74.8955, 32.1891]);
        const features = window.__map.queryRenderedFeatures(pt, { layers: ['unclustered-point'] });
        if (features.length > 0) {
          window.__map.fire('click', {
            point: pt,
            lngLat: { lng: 74.8955, lat: 32.1891 },
            features: features
          });
        }
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_complete_5_selected_event.png', Buffer.from(shot.result.data, 'base64'));

    // 6. Basemap Switch -> Thermal IR (Zoom 5.5)
    console.log('📸 6. Switching to Thermal IR Basemap...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Thermal');
        if (btn) btn.click();
        window.__map.flyTo({ center: [76.5, 30.0], zoom: 5.5, duration: 0 });
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_complete_6_thermal_basemap.png', Buffer.from(shot.result.data, 'base64'));

    // 7. Basemap Switch -> Dark GIS (Zoom 5.5)
    console.log('📸 7. Switching to Dark GIS Basemap...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Dark');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_complete_7_dark_basemap.png', Buffer.from(shot.result.data, 'base64'));

    // 8. Basemap Switch back to Natural (Zoom 5.5)
    console.log('📸 8. Switching back to Natural Basemap...');
    await send('Runtime.evaluate', {
      expression: `
        const btns = Array.from(document.querySelectorAll('button'));
        const btn = btns.find(b => b.innerText && b.innerText.trim() === 'Natural');
        if (btn) btn.click();
      `
    });
    await new Promise(r => setTimeout(r, 1500));
    shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('screenshot_verify_complete_8_natural_restored.png', Buffer.from(shot.result.data, 'base64'));

    // 9. Layer Toggle: NASA FIRMS OFF -> ON
    console.log('📸 9. Testing NASA FIRMS Layer Toggle OFF then ON...');
    const toggleTest = await send('Runtime.evaluate', {
      expression: `(() => {
        const toggleInputs = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        // Find NASA FIRMS toggle switch
        const firmsToggle = toggleInputs[0];
        if (firmsToggle) firmsToggle.click();
        const visOff = window.__map.getLayoutProperty('clusters-circle', 'visibility');
        if (firmsToggle) firmsToggle.click();
        const visOn = window.__map.getLayoutProperty('clusters-circle', 'visibility');
        return { visOff, visOn };
      })()`,
      returnByValue: true
    });
    console.log('Layer Toggle Verification:', toggleTest.result?.result?.value || toggleTest.result?.value);

    ws.close();
    chrome.kill();
    console.log('🎉 Complete verification suite finished successfully!');
  } catch (err) {
    console.error('Error during run:', err);
    chrome.kill();
  }
}

run();
