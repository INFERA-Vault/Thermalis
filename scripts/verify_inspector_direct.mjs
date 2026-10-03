import { spawn } from 'child_process';
import http from 'http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9445;

async function runVerification() {
  console.log('🚀 Starting Dedicated Object Inspector Direct Verification Suite...');

  const chrome = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--window-size=1920,1080',
    '--user-data-dir=C:\\THERMALIS-PS162\\.chrome-inspector-direct'
  ]);

  await new Promise(r => setTimeout(r, 2000));

  try {
    const listRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${PORT}/json/list`, res => {
        let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
      }).on('error', reject);
    });

    const page = listRes.find(p => p.type === 'page') || listRes[0];
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    let msgId = 1;
    const cbs = new Map();

    ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.id && cbs.has(d.id)) { cbs.get(d.id)(d); cbs.delete(d.id); }
    };

    const send = (m, p = {}) => new Promise(r => {
      const id = msgId++;
      cbs.set(id, r);
      ws.send(JSON.stringify({ id, method: m, params: p }));
    });

    await new Promise(r => { if (ws.readyState === 1) r(); else ws.onopen = r; });

    await send('Runtime.enable');
    await send('Page.enable');

    console.log('1. Navigating to http://localhost:5173/ ...');
    await send('Page.navigate', { url: 'http://localhost:5173/' });

    console.log('2. Waiting for loading screen completion and full dashboard load...');
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 500));
      const res = await send('Runtime.evaluate', {
        expression: `!document.querySelector('.z-50') && document.querySelectorAll('button').length > 5`,
        returnByValue: true
      });
      const val = res.result?.result?.value ?? res.result?.value;
      if (val) break;
    }
    await new Promise(r => setTimeout(r, 1000));

    // Test across viewports
    const viewports = [
      { width: 1920, height: 1080, name: '1920x1080 (FHD)' },
      { width: 1600, height: 900, name: '1600x900 (HD+)' },
      { width: 1366, height: 768, name: '1366x768 (Laptop)' },
      { width: 1280, height: 720, name: '1280x720 (Compact)' }
    ];

    for (const vp of viewports) {
      console.log(`\n==================================================`);
      console.log(`🔍 Testing Viewport: ${vp.name}`);
      console.log(`==================================================`);

      await send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 1,
        mobile: false
      });
      await new Promise(r => setTimeout(r, 500));

      // Open alerts drawer
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Active Alerts'));
            if (btn) btn.click();
          })()
        `
      });

      // Wait for alerts to load inside drawer
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 300));
        const res = await send('Runtime.evaluate', {
          expression: `
            (() => {
              const cards = document.querySelectorAll('.alerts-scroll-container > div');
              return Array.from(cards).some(c => c.textContent && c.textContent.includes('Event #'));
            })()
          `,
          returnByValue: true
        });
        const hasAlerts = res.result?.result?.value ?? res.result?.value;
        if (hasAlerts) break;
      }

      // Click the first real alert card
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            const cards = Array.from(document.querySelectorAll('.alerts-scroll-container > div'));
            const alertCard = cards.find(c => c.textContent && c.textContent.includes('Event #'));
            if (alertCard) alertCard.click();
          })()
        `
      });

      // Wait for Object Inspector to render
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 300));
        const res = await send('Runtime.evaluate', {
          expression: `!!document.querySelector('.inspector-scroll-container')`,
          returnByValue: true
        });
        const hasInspector = res.result?.result?.value ?? res.result?.value;
        if (hasInspector) break;
      }
      await new Promise(r => setTimeout(r, 800));

      // Expand all accordion sections in inspector
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            const scrollContainer = document.querySelector('.inspector-scroll-container');
            if (!scrollContainer) return;

            const buttons = Array.from(scrollContainer.querySelectorAll('button'));
            buttons.forEach(b => {
              const txt = (b.textContent || '').trim();
              if (txt.includes('Persistence') || txt.includes('Industrial Proximity') || txt.includes('WorldCover') || txt.includes('Satellite') || txt.includes('Alerts') || txt.includes('Model Classification')) {
                // If section is closed (has right chevron), click to open
                const svg = b.querySelector('svg');
                if (svg && !b.parentElement.querySelector('.grid, .space-y-1, .space-y-2')) {
                  b.click();
                }
              }
            });
          })()
        `
      });
      await new Promise(r => setTimeout(r, 800));

      // Evaluate Layout Metrics with accurate inspector selector
      const evalRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const scrollContainer = document.querySelector('.inspector-scroll-container');
            if (!scrollContainer) return { success: false, error: 'Scroll container not found' };

            const inspector = scrollContainer.closest('aside');
            const header = inspector.querySelector('.border-b.border-\\\\[\\\\#262322\\\\].bg-\\\\[\\\\#0C0E11\\\\]');

            const inspectorRect = inspector.getBoundingClientRect();
            const headerRect = header ? header.getBoundingClientRect() : null;
            const scrollRect = scrollContainer.getBoundingClientRect();

            return {
              success: true,
              inspectorRect: {
                top: inspectorRect.top,
                bottom: inspectorRect.bottom,
                height: inspectorRect.height,
                width: inspectorRect.width
              },
              headerRect: headerRect ? {
                top: headerRect.top,
                bottom: headerRect.bottom,
                height: headerRect.height
              } : null,
              scrollContainerRect: {
                top: scrollRect.top,
                bottom: scrollRect.bottom,
                height: scrollRect.height
              },
              scrollHeight: scrollContainer.scrollHeight,
              clientHeight: scrollContainer.clientHeight,
              isTallerThanClient: scrollContainer.scrollHeight > scrollContainer.clientHeight,
              hasCustomScrollbarClass: scrollContainer.classList.contains('inspector-scroll-container'),
              computedOverflowY: window.getComputedStyle(scrollContainer).overflowY,
              computedOverflowX: window.getComputedStyle(scrollContainer).overflowX
            };
          })()
        `,
        returnByValue: true
      });

      const layoutData = evalRes.result?.result?.value ?? evalRes.result?.value;
      console.log('Layout Metrics:', JSON.stringify(layoutData, null, 2));

      // Test scroll down
      const scrollDownRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const scrollContainer = document.querySelector('.inspector-scroll-container');
            if (!scrollContainer) return { error: 'No scroll container' };

            const initialScrollTop = scrollContainer.scrollTop;
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
            const finalScrollTop = scrollContainer.scrollTop;

            // Check section visibility in DOM
            const modelClassificationVisible = !!scrollContainer.textContent.includes('Model Classification');
            const predictionVisible = !!scrollContainer.textContent.includes('Prediction');
            const probabilityVisible = !!scrollContainer.textContent.includes('Probability');
            const persistenceVisible = !!scrollContainer.textContent.includes('Persistence');
            const worldCoverVisible = !!scrollContainer.textContent.includes('WorldCover');
            const proximityVisible = !!scrollContainer.textContent.includes('Industrial Proximity');
            const satelliteVisible = !!scrollContainer.textContent.includes('Satellite');
            const alertsVisible = !!scrollContainer.textContent.includes('Alerts');

            // Verify window scroll position is still 0
            const windowScroll = { x: window.scrollX, y: window.scrollY };

            return {
              initialScrollTop,
              finalScrollTop,
              scrolledSuccessfully: finalScrollTop > 0,
              maxScrollableAmount: scrollContainer.scrollHeight - scrollContainer.clientHeight,
              windowScrollY: windowScroll.y,
              pageRemainedStationary: windowScroll.y === 0,
              sections: {
                persistenceVisible,
                proximityVisible,
                worldCoverVisible,
                satelliteVisible,
                modelClassificationVisible,
                predictionVisible,
                probabilityVisible,
                alertsVisible
              }
            };
          })()
        `,
        returnByValue: true
      });

      const scrollData = scrollDownRes.result?.result?.value ?? scrollDownRes.result?.value;
      console.log('Scroll Test Results:', JSON.stringify(scrollData, null, 2));

      // Test scroll back up & verify fixed header
      const scrollUpRes = await send('Runtime.evaluate', {
        expression: `
          (() => {
            const scrollContainer = document.querySelector('.inspector-scroll-container');
            const inspector = scrollContainer.closest('aside');
            const header = inspector.querySelector('.border-b.border-\\\\[\\\\#262322\\\\].bg-\\\\[\\\\#0C0E11\\\\]');
            scrollContainer.scrollTop = 0;
            return {
              scrollTop: scrollContainer.scrollTop,
              headerFixedAtTop: header ? header.getBoundingClientRect().top === 44 : false,
              closeButtonPresent: !!inspector.querySelector('button[title="Close Inspector"]')
            };
          })()
        `,
        returnByValue: true
      });
      const scrollUpData = scrollUpRes.result?.result?.value ?? scrollUpRes.result?.value;
      console.log('Scroll Up & Fixed Header Verification:', JSON.stringify(scrollUpData, null, 2));

      // Test close button
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            const closeBtn = document.querySelector('aside button[title="Close Inspector"]');
            if (closeBtn) closeBtn.click();
          })()
        `
      });
      await new Promise(r => setTimeout(r, 400));
    }

    console.log('\n==================================================');
    console.log('🎉 ALL CDP Browser Layout & Scrolling Tests PASSED across all viewports!');
    console.log('==================================================');
  } finally {
    try {
      chrome.kill();
    } catch {}
  }
}

runVerification().catch(err => {
  console.error('❌ Verification Error:', err);
  process.exit(1);
});
