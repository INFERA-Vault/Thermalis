import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface ThermalisLoadingScreenProps {
  imageSrc?: string;
  particleCount?: number;
  brightness?: number;
  blendMode?: 'source-over' | 'screen' | 'lighter';
  isReady?: boolean;
  onComplete?: () => void;
  minDurationMs?: number;
  fadeOutDurationMs?: number;
}

export const ThermalisLoadingScreen: React.FC<ThermalisLoadingScreenProps> = ({
  imageSrc = '/infera-logo.jpeg',
  particleCount = 6500,
  brightness = 0.70,
  blendMode = 'source-over',
  isReady = false,
  onComplete,
  minDurationMs = 2300,
  fadeOutDurationMs = 700
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const particlesRef = useRef<any[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const isAssembledRef = useRef(false);
  const startTimeRef = useRef(0);
  const isReadyRef = useRef(isReady);
  isReadyRef.current = isReady;

  const [displayStatus, setDisplayStatus] = useState<string>('INITIALIZING MAP ENGINE');
  const [displayProgress, setDisplayProgress] = useState<number>(18);
  const [isReadyToExit, setIsReadyToExit] = useState<boolean>(false);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);

  const mouseRef = useRef({ x: -9999, y: -9999, isHover: false, radius: 70, force: 18 });

  // 2D Bilinear Palette from INFERA thermal gradient
  const cTL = { r: 216, g: 17, b: 89 };   // Magenta-Ruby
  const cTR = { r: 247, g: 91, b: 35 };   // Orange-Red
  const cBL = { r: 255, g: 183, b: 3 };   // Gold
  const cBR = { r: 255, g: 247, b: 160 }; // White-Gold

  const createFallbackParticles = useCallback((width: number, height: number, targetCount: number) => {
    const centerX = width / 2;
    const centerY = height * 0.44;
    const radius = Math.min(width, height) * 0.22;
    const particles: any[] = [];

    for (let i = 0; i < targetCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const targetX = centerX + Math.cos(angle) * r;
      const targetY = centerY + Math.sin(angle) * r;

      const spawnAngle = Math.random() * Math.PI * 2;
      const dist = Math.max(width, height) * (0.5 + Math.random() * 0.6);
      const startX = centerX + Math.cos(spawnAngle) * dist;
      const startY = centerY + Math.sin(spawnAngle) * dist;

      const u = (targetX - (centerX - radius)) / (radius * 2);
      const v = (targetY - (centerY - radius)) / (radius * 2);
      const red = Math.round((1 - u) * (1 - v) * cTL.r + u * (1 - v) * cTR.r + (1 - u) * v * cBL.r + u * v * cBR.r);
      const green = Math.round((1 - u) * (1 - v) * cTL.g + u * (1 - v) * cTR.g + (1 - u) * v * cBL.g + u * v * cBR.g);
      const blue = Math.round((1 - u) * (1 - v) * cTL.b + u * (1 - v) * cTR.b + (1 - u) * v * cBL.b + u * v * cBR.b);
      const color = `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;

      particles.push({
        x: startX, y: startY,
        startX, startY,
        targetX, targetY,
        vx: 0, vy: 0,
        baseSize: 1.6,
        color,
        isText: false,
        heightRatio: 1.0 - (targetY - (centerY - radius)) / (radius * 2),
        seed: Math.random() * 1000,
        delay: Math.random() * 0.4
      });
    }

    particlesRef.current = particles;
    isAssembledRef.current = false;
    startTimeRef.current = performance.now();
  }, [cBL.b, cBL.g, cBL.r, cBR.b, cBR.g, cBR.r, cTL.b, cTL.g, cTL.r, cTR.b, cTR.g, cTR.r]);

  const sampleLogo = useCallback((img: HTMLImageElement, width: number, height: number, targetCount: number) => {
    try {
      const offCanvas = document.createElement('canvas');
      const sampleSize = 512;
      offCanvas.width = sampleSize;
      offCanvas.height = sampleSize;
      const offCtx = offCanvas.getContext('2d');
      if (!offCtx) {
        createFallbackParticles(width, height, targetCount);
        return;
      }

      offCtx.fillStyle = '#ffffff';
      offCtx.fillRect(0, 0, sampleSize, sampleSize);
      offCtx.drawImage(img, 0, 0, sampleSize, sampleSize);

      const imgData = offCtx.getImageData(0, 0, sampleSize, sampleSize);
      const data = imgData.data;
      const logoScale = Math.min(width, height) * 0.54 / sampleSize;
      const centerX = width / 2;
      const centerY = height * 0.44;

      const allCandidatePoints: any[] = [];
      for (let y = 0; y < sampleSize; y += 2) {
        for (let x = 0; x < sampleSize; x += 2) {
          const idx = (y * sampleSize + x) * 4;
          const b = data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114;
          if (b < 165) {
            allCandidatePoints.push({
              x, y,
              isText: y > sampleSize * 0.72,
              heightRatio: 1.0 - (y / sampleSize),
              xNorm: x / sampleSize,
              yNorm: y / sampleSize
            });
          }
        }
      }

      const total = allCandidatePoints.length;
      if (total === 0) {
        createFallbackParticles(width, height, targetCount);
        return;
      }

      const stride = Math.max(1, total / targetCount);
      const particles: any[] = [];

      for (let i = 0; i < targetCount && Math.floor(i * stride) < total; i++) {
        const pt = allCandidatePoints[Math.floor(i * stride)];
        const targetX = centerX + (pt.x - sampleSize / 2) * logoScale;
        const targetY = centerY + (pt.y - sampleSize / 2) * logoScale;

        const angle = Math.random() * Math.PI * 2;
        const dist = Math.max(width, height) * (0.5 + Math.random() * 0.6);
        const startX = centerX + Math.cos(angle) * dist;
        const startY = centerY + Math.sin(angle) * dist;

        let color = '#ffc837';
        if (pt.isText) {
          color = Math.random() > 0.35 ? '#ffc837' : '#fff4cc';
        } else {
          const u = pt.xNorm;
          const v = pt.yNorm;
          const r = Math.round((1 - u) * (1 - v) * cTL.r + u * (1 - v) * cTR.r + (1 - u) * v * cBL.r + u * v * cBR.r);
          const g = Math.round((1 - u) * (1 - v) * cTL.g + u * (1 - v) * cTR.g + (1 - u) * v * cBL.g + u * v * cBR.g);
          const b = Math.round((1 - u) * (1 - v) * cTL.b + u * (1 - v) * cTR.b + (1 - u) * v * cBL.b + u * v * cBR.b);
          color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }

        particles.push({
          x: startX, y: startY,
          startX, startY,
          targetX, targetY,
          vx: 0, vy: 0,
          baseSize: pt.isText ? 1.5 : 1.8,
          color,
          isText: pt.isText,
          heightRatio: pt.heightRatio,
          seed: Math.random() * 1000,
          delay: (1.0 - pt.heightRatio) * 0.25 + Math.random() * 0.2
        });
      }

      particlesRef.current = particles;
      isAssembledRef.current = false;
      startTimeRef.current = performance.now();
    } catch (err) {
      console.warn('Canvas logo sampling fallback triggered:', err);
      createFallbackParticles(width, height, targetCount);
    }
  }, [cBL.b, cBL.g, cBL.r, cBR.b, cBR.g, cBR.r, cTL.b, cTL.g, cTL.r, cTR.b, cTR.g, cTR.r, createFallbackParticles]);

  const updateCanvasDimensions = useCallback(() => {
    if (!canvasRef.current) return { width: 0, height: 0, dpr: 1 };
    const rect = containerRef.current?.getBoundingClientRect() || {
      width: window.innerWidth || 1920,
      height: window.innerHeight || 1080
    };
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round((rect.width || window.innerWidth || 1920) * dpr);
    const h = Math.round((rect.height || window.innerHeight || 1080) * dpr);

    canvasRef.current.width = w;
    canvasRef.current.height = h;
    canvasRef.current.style.width = `${rect.width || window.innerWidth}px`;
    canvasRef.current.style.height = `${rect.height || window.innerHeight}px`;

    return { width: w, height: h, dpr };
  }, []);

  // Handle responsive canvas sizing & initial measurement
  useEffect(() => {
    const handleResize = () => {
      const { width, height } = updateCanvasDimensions();
      if (imgRef.current && width > 0 && height > 0) {
        sampleLogo(imgRef.current, width, height, particleCount);
      }
    };

    updateCanvasDimensions();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateCanvasDimensions, sampleLogo, particleCount]);

  // Load and sample the logo image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imageSrc;

    img.onload = () => {
      imgRef.current = img;
      const { width, height } = updateCanvasDimensions();
      const validW = width > 0 ? width : (window.innerWidth || 1920) * Math.min(window.devicePixelRatio || 1, 2);
      const validH = height > 0 ? height : (window.innerHeight || 1080) * Math.min(window.devicePixelRatio || 1, 2);
      sampleLogo(img, validW, validH, particleCount);
    };

    img.onerror = () => {
      console.warn(`Failed to load logo image at "${imageSrc}". Using procedural particle grid.`);
      const { width, height } = updateCanvasDimensions();
      const validW = width > 0 ? width : (window.innerWidth || 1920) * Math.min(window.devicePixelRatio || 1, 2);
      const validH = height > 0 ? height : (window.innerHeight || 1080) * Math.min(window.devicePixelRatio || 1, 2);
      createFallbackParticles(validW, validH, particleCount);
    };
  }, [imageSrc, particleCount, sampleLogo, createFallbackParticles, updateCanvasDimensions]);

  // Main Canvas Render Loop with Living Fire Physics
  useEffect(() => {
    const render = (now: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const timeSec = now / 1000;
      const elapsed = startTimeRef.current ? (now - startTimeRef.current) / 1000 : 0;
      const progress = Math.min(elapsed / 2.0, 1.0);

      if (progress >= 1.0) isAssembledRef.current = true;

      ctx.fillStyle = '#030407';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = blendMode;

      const particles = particlesRef.current;
      const pLen = particles.length;
      const mouse = mouseRef.current;
      const mouseRadius = mouse.radius * dpr;
      const mouseRadiusSq = mouseRadius * mouseRadius;

      for (let i = 0; i < pLen; i++) {
        const p = particles[i];

        if (!isAssembledRef.current) {
          const pProg = Math.max(0, Math.min(1.0, (progress - p.delay * 0.4) / (1.0 - p.delay * 0.4)));
          const ease = 1 - Math.pow(1 - pProg, 3.2);
          const swirl = (1 - pProg) * 50;
          p.x = p.startX + (p.targetX - p.startX) * ease + Math.cos(timeSec * 3.5 + p.seed) * swirl;
          p.y = p.startY + (p.targetY - p.startY) * ease + Math.sin(timeSec * 3.5 + p.seed) * swirl;
          p.alpha = ease * brightness;
        } else {
          // Living fire physics (6.5k particles at 120 FPS)
          p.vy -= 0.35 * 0.6 * p.heightRatio;
          p.vx += Math.sin(timeSec * 3.8 + p.y * 0.03 + p.seed) * (0.35 * p.heightRatio);
          p.vy += Math.cos(timeSec * 3.2 + p.x * 0.03 + p.seed) * (0.2 * p.heightRatio);

          if (mouse.isHover) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < mouseRadiusSq && distSq > 1) {
              const dist = Math.sqrt(distSq);
              const force = (1 - dist / mouseRadius) * mouse.force * dpr;
              p.vx += (dx / dist) * force;
              p.vy += (dy / dist) * force;
            }
          }

          p.vx = (p.vx + (p.targetX - p.x) * 0.065) * 0.86;
          p.vy = (p.vy + (p.targetY - p.y) * 0.065) * 0.86;
          p.x += p.vx;
          p.y += p.vy;
          p.alpha = brightness;
        }

        const flicker = Math.sin(timeSec * 5.5 + p.seed * 2) * 0.2 + 0.8;
        const pSize = Math.max(0.8, p.baseSize * dpr * flicker);

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha * flicker;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pSize, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [brightness, blendMode]);

  // Realistic Staged Progress and Status Management
  useEffect(() => {
    const startTs = Date.now();
    let transitionScheduled = false;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTs;

      // Realistic progressive status stages
      if (!isReadyToExit) {
        if (elapsed < 450) {
          setDisplayStatus('INITIALIZING MAP ENGINE');
          setDisplayProgress(18);
        } else if (elapsed < 900) {
          setDisplayStatus('CONNECTING TO FIRMS');
          setDisplayProgress(38);
        } else if (elapsed < 1400) {
          setDisplayStatus('LOADING THERMAL OBSERVATIONS');
          setDisplayProgress(58);
        } else if (elapsed < 1900) {
          setDisplayStatus('INITIALIZING ANALYSIS');
          setDisplayProgress(76);
        } else {
          setDisplayStatus('SYNCHRONIZING GEOSPATIAL DATA');
          setDisplayProgress(90);
        }
      }

      // Check exit condition: minimum duration met AND application reports ready (or safety timeout reached)
      const minDurationCompleted = elapsed >= minDurationMs;
      const safetyTimeoutReached = elapsed >= 8000;
      const canExit = (minDurationCompleted && isReadyRef.current) || safetyTimeoutReached;

      if (canExit && !transitionScheduled) {
        transitionScheduled = true;
        setIsReadyToExit(true);
        setDisplayStatus('THERMALIS READY');
        setDisplayProgress(100);

        // Hold 'THERMALIS READY' briefly, then fade out smoothly
        setTimeout(() => {
          setIsFadingOut(true);
          setTimeout(() => {
            if (onComplete) onComplete();
          }, fadeOutDurationMs);
        }, 380);
      }
    }, 60);

    return () => clearInterval(interval);
  }, [isReadyToExit, minDurationMs, fadeOutDurationMs, onComplete]);

  return (
    <div 
      ref={containerRef} 
      className={`fixed inset-0 w-screen h-screen z-50 overflow-hidden select-none transition-opacity ease-out pointer-events-auto ${
        isFadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background: '#030407',
        transitionDuration: `${fadeOutDurationMs}ms`,
        transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      onMouseMove={(e) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        mouseRef.current.x = (e.clientX - rect.left) * dpr;
        mouseRef.current.y = (e.clientY - rect.top) * dpr;
        mouseRef.current.isHover = true;
      }}
      onMouseLeave={() => { mouseRef.current.isHover = false; }}
    >
      {/* 2D Particle Canvas */}
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 w-full h-full cursor-crosshair" 
      />

      {/* Minimal THERMALIS Branding & Live Status Layer */}
      <div className="absolute left-0 right-0 bottom-10 sm:bottom-12 flex flex-col items-center justify-center pointer-events-none select-none px-6 z-10">
        {/* Brand Header */}
        <div className="flex items-center space-x-2.5 tracking-[0.32em] text-[15px] sm:text-[17px] font-semibold text-white/95 uppercase drop-shadow-[0_2px_12px_rgba(255,183,3,0.35)]">
          <span>THERMALIS</span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#f75b23] to-[#ffb703] animate-pulse" />
        </div>

        {/* Subtitle */}
        <div className="mt-1 text-[10px] sm:text-[11px] font-mono tracking-[0.22em] text-[#ffb703]/85 uppercase">
          INDUSTRIAL FIRE & THERMAL INTELLIGENCE
        </div>

        {/* Dynamic Status Text */}
        <div className="mt-4 flex items-center space-x-2 text-[10px] sm:text-[11px] font-mono tracking-[0.16em] text-neutral-300">
          <span 
            className={`inline-block w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
              isReadyToExit ? 'bg-[#00e676] shadow-[0_0_8px_#00e676]' : 'bg-[#f75b23] animate-ping'
            }`} 
          />
          <span className={isReadyToExit ? 'text-[#00e676] font-semibold' : 'text-neutral-300'}>
            {displayStatus}
          </span>
        </div>

        {/* Staged Minimal Progress Bar */}
        <div className="mt-2.5 w-44 sm:w-52 h-[2.5px] bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
          <div 
            className="h-full bg-gradient-to-r from-[#d81159] via-[#f75b23] to-[#ffb703] transition-all duration-300 ease-out shadow-[0_0_10px_rgba(247,91,35,0.6)]"
            style={{ width: `${Math.min(100, Math.max(8, displayProgress))}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export default ThermalisLoadingScreen;
