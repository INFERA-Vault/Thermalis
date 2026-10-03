/**
 * THERMALIS Liquid Glass Container
 * Manages WebGL context, geometry, and procedural physical liquid-glass material overlay.
 * 
 * In the hybrid architecture:
 * - Live background blur is handled natively by CSS `backdrop-filter: blur(3.5px)` on the container.
 * - This WebGL layer renders the optical liquid-glass treatment:
 *   physical fire rim lighting, inner bevel refraction, corner boost, and shape masking.
 * - Zero snapshot dependencies, zero html2canvas lag, 60fps real-time map synchronization.
 */
import {
  LiquidGlassOptions,
  LiquidGlassShape,
  LiquidGlassVariant,
  GLProgramRefs
} from './types';
import {
  vertexShaderSource,
  containerFragmentShaderSource
} from './shaders';
import { THERMAL_FIRE_GLASS } from './presets';

export class Container {
  public canvas: HTMLCanvasElement;
  public element: HTMLElement;
  public options: LiquidGlassOptions;
  public width = 0;
  public height = 0;
  public borderRadius = 16;
  public type: LiquidGlassShape = 'rounded';
  public variant: LiquidGlassVariant = 'default';
  public tintOpacity = 0.22;
  public blurRadius = 3.5;
  public edgeIntensity = 0.025;
  public rimIntensity = 0.090;
  public baseIntensity = 0.003;
  public rippleEffect = 0.01;
  public warp = false;

  private gl: WebGLRenderingContext | null = null;
  private glRefs: GLProgramRefs | null = null;
  private isDestroyed = false;
  private isContextLost = false;
  private resizeObserver: ResizeObserver | null = null;
  private animationFrameId: number | null = null;
  private handleContextLost: ((e: Event) => void) | null = null;
  private handleContextRestored: (() => void) | null = null;

  constructor(element: HTMLElement, canvas: HTMLCanvasElement, options: LiquidGlassOptions = {}) {
    this.element = element;
    this.canvas = canvas;
    this.options = options;

    this.type = options.type || 'rounded';
    this.variant = options.variant || 'default';
    this.borderRadius = options.borderRadius ?? (this.type === 'pill' ? 999 : 14);
    this.tintOpacity = options.tintOpacity ?? THERMAL_FIRE_GLASS.tintOpacity;
    this.blurRadius = options.blurRadius ?? THERMAL_FIRE_GLASS.blurRadius;
    this.edgeIntensity = options.edgeIntensity ?? THERMAL_FIRE_GLASS.edgeIntensity;
    this.rimIntensity = options.rimIntensity ?? THERMAL_FIRE_GLASS.rimIntensity;
    this.baseIntensity = options.baseIntensity ?? THERMAL_FIRE_GLASS.baseIntensity;
    this.rippleEffect = options.rippleEffect ?? THERMAL_FIRE_GLASS.rippleEffect;
    this.warp = options.warp ?? THERMAL_FIRE_GLASS.warp;

    this.init();
  }

  public getGL(): WebGLRenderingContext | null {
    return this.gl;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public isReady(): boolean {
    return Boolean(this.gl && this.glRefs && this.glRefs.program && !this.isDestroyed && !this.isContextLost);
  }

  private init(): void {
    try {
      // Attach WebGL context loss listeners once
      if (!this.handleContextLost) {
        this.handleContextLost = (e: Event) => {
          e.preventDefault();
          this.isContextLost = true;
          if (this.options.onContextStateChange) {
            this.options.onContextStateChange(false);
          }
        };
        this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false);
      }

      if (!this.handleContextRestored) {
        this.handleContextRestored = () => {
          this.isContextLost = false;
          this.init();
          if (this.options.onContextStateChange) {
            this.options.onContextStateChange(true);
          }
        };
        this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false);
      }

      this.gl = this.canvas.getContext('webgl', {
        preserveDrawingBuffer: true,
        alpha: true,
        antialias: true,
        depth: false,
        stencil: false
      });

      if (!this.gl) {
        console.warn('WebGL not supported for LiquidGlassContainer');
        return;
      }

      this.setupShadersAndBuffers();
      this.updateSizeFromDOM();
      this.render();

      // Watch for element layout changes
      if (!this.resizeObserver && typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          this.updateSizeFromDOM();
        });
        this.resizeObserver.observe(this.element);
      }
    } catch (e) {
      console.warn('Failed to initialize LiquidGlassContainer:', e);
    }
  }

  public updateOptions(newOptions: Partial<LiquidGlassOptions>): void {
    if (newOptions.type !== undefined) this.type = newOptions.type;
    if (newOptions.variant !== undefined) this.variant = newOptions.variant;
    if (newOptions.borderRadius !== undefined) this.borderRadius = newOptions.borderRadius;
    if (newOptions.tintOpacity !== undefined) this.tintOpacity = newOptions.tintOpacity;
    if (newOptions.blurRadius !== undefined) this.blurRadius = newOptions.blurRadius;
    if (newOptions.edgeIntensity !== undefined) this.edgeIntensity = newOptions.edgeIntensity;
    if (newOptions.rimIntensity !== undefined) this.rimIntensity = newOptions.rimIntensity;
    if (newOptions.baseIntensity !== undefined) this.baseIntensity = newOptions.baseIntensity;
    if (newOptions.rippleEffect !== undefined) this.rippleEffect = newOptions.rippleEffect;
    if (newOptions.warp !== undefined) this.warp = newOptions.warp;

    this.render();
  }

  private setupShadersAndBuffers(): void {
    if (!this.gl) return;
    const gl = this.gl;

    const program = this.createProgram(gl, vertexShaderSource, containerFragmentShaderSource);
    if (!program) return;

    gl.useProgram(program);

    // Quad geometry covering screen
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const texcoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
      gl.STATIC_DRAW
    );

    const positionLoc = gl.getAttribLocation(program, 'a_position');
    const texcoordLoc = gl.getAttribLocation(program, 'a_texcoord');

    this.glRefs = {
      gl,
      program,
      texture: null,
      positionBuffer,
      texcoordBuffer,
      positionLoc,
      texcoordLoc,
      resolutionLoc: gl.getUniformLocation(program, 'u_resolution'),
      textureSizeLoc: null,
      scrollYLoc: null,
      pageHeightLoc: null,
      viewportHeightLoc: null,
      blurRadiusLoc: gl.getUniformLocation(program, 'u_blurRadius'),
      borderRadiusLoc: gl.getUniformLocation(program, 'u_borderRadius'),
      containerPositionLoc: null,
      warpLoc: null,
      edgeIntensityLoc: gl.getUniformLocation(program, 'u_edgeIntensity'),
      rimIntensityLoc: gl.getUniformLocation(program, 'u_rimIntensity'),
      baseIntensityLoc: gl.getUniformLocation(program, 'u_baseIntensity'),
      edgeDistanceLoc: gl.getUniformLocation(program, 'u_edgeDistance'),
      rimDistanceLoc: gl.getUniformLocation(program, 'u_rimDistance'),
      baseDistanceLoc: gl.getUniformLocation(program, 'u_baseDistance'),
      cornerBoostLoc: gl.getUniformLocation(program, 'u_cornerBoost'),
      rippleEffectLoc: gl.getUniformLocation(program, 'u_rippleEffect'),
      tintOpacityLoc: gl.getUniformLocation(program, 'u_tintOpacity'),
      tintColorLoc: gl.getUniformLocation(program, 'u_tintColor'),
      rimColorLoc: gl.getUniformLocation(program, 'u_rimColor'),
      imageLoc: null
    };
  }

  public updateSizeFromDOM(): void {
    if (!this.element || !this.canvas || this.isDestroyed || this.isContextLost) return;

    const rect = this.element.getBoundingClientRect();
    // Guard against hidden / collapsed / display:none elements
    if (rect.width <= 0 || rect.height <= 0) return;

    let newWidth = Math.ceil(rect.width);
    let newHeight = Math.ceil(rect.height);

    if (this.type === 'circle') {
      const size = Math.max(newWidth, newHeight);
      newWidth = size;
      newHeight = size;
      this.borderRadius = size / 2;
    } else if (this.type === 'pill') {
      this.borderRadius = newHeight / 2;
    }

    if (newWidth !== this.width || newHeight !== this.height) {
      this.width = newWidth;
      this.height = newHeight;

      this.canvas.width = newWidth;
      this.canvas.height = newHeight;
      this.canvas.style.width = `${newWidth}px`;
      this.canvas.style.height = `${newHeight}px`;

      this.render();
    }
  }

  public getPosition(): { x: number; y: number } {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };
  }

  private getVariantColors(): { tint: [number, number, number]; rim: [number, number, number] } {
    if (this.options.tintColor && this.options.rimColor) {
      return { tint: this.options.tintColor, rim: this.options.rimColor };
    }

    switch (this.variant) {
      case 'fire-active':
        // Flame amber active tint with controlled warm gold rim
        return {
          tint: [0.16, 0.05, 0.02],
          rim: [1.0, 0.55, 0.0]
        };
      case 'fire-subtle':
        // Smoked dark charcoal with faint warm ember rim
        return {
          tint: [0.05, 0.038, 0.034],
          rim: [0.92, 0.36, 0.05]
        };
      case 'critical':
        // High severity fire alert (deep wine tint)
        return {
          tint: [0.18, 0.02, 0.02],
          rim: [1.0, 0.12, 0.06]
        };
      case 'smoked':
        // Sleek neutral smoked glass with restrained warm amber rim
        return {
          tint: [0.048, 0.042, 0.040],
          rim: [0.78, 0.38, 0.10]
        };
      case 'default':
      default:
        // Dark translucent glass with physical warm fire rim
        return {
          tint: [0.048, 0.036, 0.032],
          rim: [0.95, 0.38, 0.05]
        };
    }
  }

  public render(): void {
    if (!this.gl || !this.glRefs || this.isDestroyed || this.isContextLost) return;
    const gl = this.gl;
    const refs = this.glRefs;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(refs.program);

    // Bind geometry
    gl.bindBuffer(gl.ARRAY_BUFFER, refs.positionBuffer);
    gl.enableVertexAttribArray(refs.positionLoc);
    gl.vertexAttribPointer(refs.positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, refs.texcoordBuffer);
    gl.enableVertexAttribArray(refs.texcoordLoc);
    gl.vertexAttribPointer(refs.texcoordLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    if (refs.resolutionLoc) gl.uniform2f(refs.resolutionLoc, this.canvas.width, this.canvas.height);
    if (refs.blurRadiusLoc) gl.uniform1f(refs.blurRadiusLoc, this.blurRadius);
    if (refs.borderRadiusLoc) gl.uniform1f(refs.borderRadiusLoc, this.borderRadius);
    if (refs.edgeIntensityLoc) gl.uniform1f(refs.edgeIntensityLoc, this.edgeIntensity);
    if (refs.rimIntensityLoc) gl.uniform1f(refs.rimIntensityLoc, this.rimIntensity);
    if (refs.baseIntensityLoc) gl.uniform1f(refs.baseIntensityLoc, this.baseIntensity);
    if (refs.cornerBoostLoc) gl.uniform1f(refs.cornerBoostLoc, this.options.cornerBoost ?? 0.015);
    if (refs.rippleEffectLoc) gl.uniform1f(refs.rippleEffectLoc, this.rippleEffect);
    if (refs.tintOpacityLoc) gl.uniform1f(refs.tintOpacityLoc, this.tintOpacity);

    const { tint, rim } = this.getVariantColors();
    if (refs.tintColorLoc) gl.uniform3f(refs.tintColorLoc, tint[0], tint[1], tint[2]);
    if (refs.rimColorLoc) gl.uniform3f(refs.rimColorLoc, rim[0], rim[1], rim[2]);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  public destroy(): void {
    this.isDestroyed = true;

    if (this.handleContextLost) {
      this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      this.handleContextLost = null;
    }

    if (this.handleContextRestored) {
      this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
      this.handleContextRestored = null;
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.gl && this.glRefs) {
      const gl = this.gl;
      if (this.glRefs.positionBuffer) gl.deleteBuffer(this.glRefs.positionBuffer);
      if (this.glRefs.texcoordBuffer) gl.deleteBuffer(this.glRefs.texcoordBuffer);
      if (this.glRefs.program) gl.deleteProgram(this.glRefs.program);
    }

    this.glRefs = null;
    this.gl = null;
  }

  protected createProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string): WebGLProgram | null {
    const vs = this.compileShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    if (!program) return null;

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Program link failed:', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return null;
    }

    return program;
  }

  protected compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Shader compile failed:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }

    return shader;
  }
}
