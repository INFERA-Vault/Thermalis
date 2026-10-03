/**
 * THERMALIS Liquid Glass Button
 * Provides compact pill, circle, or rounded interactive glass buttons,
 * supporting both standalone page refraction and nested parent container sampling.
 */
import { Container } from './Container';
import { LiquidGlassOptions, GLProgramRefs } from './types';
import { vertexShaderSource, nestedFragmentShaderSource } from './shaders';

export interface LiquidGlassButtonOptions extends LiquidGlassOptions {
  parentContainer?: Container | null;
  active?: boolean;
}

export class Button extends Container {
  public parentContainer: Container | null = null;
  public isNested = false;
  public isActive = false;
  private nestedGlRefs: GLProgramRefs | null = null;
  private nestedRenderId: number | null = null;

  constructor(
    element: HTMLElement,
    canvas: HTMLCanvasElement,
    options: LiquidGlassButtonOptions = {}
  ) {
    const defaultRadius = options.type === 'circle' ? 999 : options.type === 'pill' ? 999 : 10;
    super(element, canvas, {
      ...options,
      borderRadius: options.borderRadius ?? defaultRadius,
      tintOpacity: options.tintOpacity ?? (options.active ? 0.22 : 0.16),
      variant: options.variant ?? (options.active ? 'fire-active' : 'default'),
      rimIntensity: options.rimIntensity ?? (options.active ? 0.08 : 0.04)
    });

    this.isActive = options.active ?? false;
    this.parentContainer = options.parentContainer ?? null;

    if (this.parentContainer) {
      this.setupNestedGlass();
    }
  }

  public setActive(active: boolean): void {
    if (this.isActive === active) return;
    this.isActive = active;
    this.variant = active ? 'fire-active' : 'default';
    this.tintOpacity = active ? 0.22 : 0.15;
    this.rimIntensity = active ? 0.08 : 0.04;
    this.render();
  }

  private setupNestedGlass(): void {
    const gl = this.getGL();
    if (!gl || !this.parentContainer) return;

    this.isNested = true;
    const program = this.createProgram(gl, vertexShaderSource, nestedFragmentShaderSource);
    if (!program) return;

    gl.useProgram(program);

    // Buffers
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

    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const parentCanvas = this.parentContainer.getCanvas();
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      parentCanvas.width || 100,
      parentCanvas.height || 100,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.nestedGlRefs = {
      gl,
      program,
      texture,
      positionBuffer,
      texcoordBuffer,
      positionLoc,
      texcoordLoc,
      resolutionLoc: gl.getUniformLocation(program, 'u_resolution'),
      textureSizeLoc: gl.getUniformLocation(program, 'u_textureSize'),
      blurRadiusLoc: gl.getUniformLocation(program, 'u_blurRadius'),
      borderRadiusLoc: gl.getUniformLocation(program, 'u_borderRadius'),
      buttonPositionLoc: gl.getUniformLocation(program, 'u_buttonPosition'),
      containerPositionLoc: gl.getUniformLocation(program, 'u_containerPosition'),
      containerSizeLoc: gl.getUniformLocation(program, 'u_containerSize'),
      warpLoc: gl.getUniformLocation(program, 'u_warp'),
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
      imageLoc: gl.getUniformLocation(program, 'u_image')
    };

    // Render nested glass
    this.renderNested();
  }

  public renderNested(): void {
    if (!this.isNested || !this.nestedGlRefs || !this.parentContainer) {
      super.render();
      return;
    }

    const gl = this.nestedGlRefs.gl;
    const refs = this.nestedGlRefs;
    const parentCanvas = this.parentContainer.getCanvas();

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Update texture from parent canvas
    gl.bindTexture(gl.TEXTURE_2D, refs.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, parentCanvas);

    gl.useProgram(refs.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, refs.positionBuffer);
    gl.enableVertexAttribArray(refs.positionLoc);
    gl.vertexAttribPointer(refs.positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, refs.texcoordBuffer);
    gl.enableVertexAttribArray(refs.texcoordLoc);
    gl.vertexAttribPointer(refs.texcoordLoc, 2, gl.FLOAT, false, 0, 0);

    if (refs.resolutionLoc) gl.uniform2f(refs.resolutionLoc, this.canvas.width, this.canvas.height);
    if (refs.textureSizeLoc) gl.uniform2f(refs.textureSizeLoc, parentCanvas.width, parentCanvas.height);
    if (refs.blurRadiusLoc) gl.uniform1f(refs.blurRadiusLoc, this.blurRadius);
    if (refs.borderRadiusLoc) gl.uniform1f(refs.borderRadiusLoc, this.borderRadius);
    if (refs.warpLoc) gl.uniform1f(refs.warpLoc, 0.0);
    if (refs.edgeIntensityLoc) gl.uniform1f(refs.edgeIntensityLoc, this.edgeIntensity);
    if (refs.rimIntensityLoc) gl.uniform1f(refs.rimIntensityLoc, this.rimIntensity);
    if (refs.baseIntensityLoc) gl.uniform1f(refs.baseIntensityLoc, this.baseIntensity);
    if (refs.edgeDistanceLoc) gl.uniform1f(refs.edgeDistanceLoc, 0.15);
    if (refs.rimDistanceLoc) gl.uniform1f(refs.rimDistanceLoc, 0.8);
    if (refs.baseDistanceLoc) gl.uniform1f(refs.baseDistanceLoc, 0.1);
    if (refs.cornerBoostLoc) gl.uniform1f(refs.cornerBoostLoc, 0.02);
    if (refs.rippleEffectLoc) gl.uniform1f(refs.rippleEffectLoc, this.rippleEffect);
    if (refs.tintOpacityLoc) gl.uniform1f(refs.tintOpacityLoc, this.tintOpacity);

    const buttonPos = this.getPosition();
    const parentPos = this.parentContainer.getPosition();
    if (refs.buttonPositionLoc) gl.uniform2f(refs.buttonPositionLoc, buttonPos.x, buttonPos.y);
    if (refs.containerPositionLoc) gl.uniform2f(refs.containerPositionLoc, parentPos.x, parentPos.y);
    if (refs.containerSizeLoc) gl.uniform2f(refs.containerSizeLoc, parentCanvas.width, parentCanvas.height);

    const rimColor: [number, number, number] = this.isActive
      ? [1.0, 0.55, 0.0]
      : [0.95, 0.42, 0.05];
    const tintColor: [number, number, number] = this.isActive
      ? [0.22, 0.05, 0.02]
      : [0.05, 0.06, 0.08];

    if (refs.tintColorLoc) gl.uniform3f(refs.tintColorLoc, tintColor[0], tintColor[1], tintColor[2]);
    if (refs.rimColorLoc) gl.uniform3f(refs.rimColorLoc, rimColor[0], rimColor[1], rimColor[2]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, refs.texture);
    if (refs.imageLoc) gl.uniform1i(refs.imageLoc, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  public override destroy(): void {
    if (this.nestedRenderId) {
      cancelAnimationFrame(this.nestedRenderId);
      this.nestedRenderId = null;
    }

    if (this.nestedGlRefs && this.nestedGlRefs.gl) {
      const gl = this.nestedGlRefs.gl;
      if (this.nestedGlRefs.texture) gl.deleteTexture(this.nestedGlRefs.texture);
      if (this.nestedGlRefs.positionBuffer) gl.deleteBuffer(this.nestedGlRefs.positionBuffer);
      if (this.nestedGlRefs.texcoordBuffer) gl.deleteBuffer(this.nestedGlRefs.texcoordBuffer);
      if (this.nestedGlRefs.program) gl.deleteProgram(this.nestedGlRefs.program);
      this.nestedGlRefs = null;
    }

    super.destroy();
  }
}
