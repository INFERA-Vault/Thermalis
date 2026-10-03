/**
 * THERMALIS Liquid Glass UI System
 * Hybrid Liquid Glass WebGL Shaders
 * 
 * In the hybrid architecture:
 * 1. The underlying live background (MapLibre satellite imagery, labels, terrain)
 *    is blurred in real time (60fps) by the browser compositor via native CSS `backdrop-filter: blur(3.5px)`.
 * 2. This WebGL overlay renders the physical liquid-glass material treatment:
 *    - Physical fire rim lighting along outer borders
 *    - Optical inner bevel refraction highlight
 *    - Corner depth boost
 *    - Top specular reflection gradient
 *    - Accurate rounded-rect / pill / circle shape clipping mask
 * 
 * Result: 100% LIVE, zero-lag map background with authentic physical liquid-glass depth and glowing fire rims.
 */

export const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texcoord;
  varying vec2 v_texcoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texcoord = a_texcoord;
  }
`;

export const containerFragmentShaderSource = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_blurRadius;
  uniform float u_borderRadius;
  uniform float u_edgeIntensity;
  uniform float u_rimIntensity;
  uniform float u_baseIntensity;
  uniform float u_edgeDistance;
  uniform float u_rimDistance;
  uniform float u_baseDistance;
  uniform float u_cornerBoost;
  uniform float u_rippleEffect;
  uniform float u_tintOpacity;
  uniform vec3 u_tintColor;
  uniform vec3 u_rimColor;
  varying vec2 v_texcoord;

  // Function to calculate distance from rounded rectangle edge
  float roundedRectDistance(vec2 coord, vec2 size, float radius) {
    vec2 center = size * 0.5;
    vec2 pixelCoord = coord * size;
    vec2 toCorner = abs(pixelCoord - center) - (center - radius);
    float outsideCorner = length(max(toCorner, 0.0));
    float insideCorner = min(max(toCorner.x, toCorner.y), 0.0);
    return (outsideCorner + insideCorner - radius);
  }

  // Function to calculate distance from circle edge
  float circleDistance(vec2 coord, vec2 size, float radius) {
    vec2 pixelCoord = coord * size;
    vec2 centerPixel = size * 0.5;
    float distFromCenter = length(pixelCoord - centerPixel);
    return distFromCenter - radius;
  }

  // Check if this is a pill shape
  bool isPill(vec2 size, float radius) {
    float heightRatioDiff = abs(radius - size.y * 0.5);
    bool radiusMatchesHeight = heightRatioDiff < 2.0;
    bool isWiderThanTall = size.x > size.y + 4.0;
    return radiusMatchesHeight && isWiderThanTall;
  }

  // Check if this is a circle shape
  bool isCircle(vec2 size, float radius) {
    float minDim = min(size.x, size.y);
    bool radiusMatchesMinDim = abs(radius - minDim * 0.5) < 2.0;
    bool isRoughlySquare = abs(size.x - size.y) < 4.0;
    return radiusMatchesMinDim && isRoughlySquare;
  }

  // Function to calculate distance from pill edge (capsule)
  float pillDistance(vec2 coord, vec2 size, float radius) {
    vec2 center = size * 0.5;
    vec2 pixelCoord = coord * size;
    vec2 capsuleStart = vec2(radius, center.y);
    vec2 capsuleEnd = vec2(size.x - radius, center.y);
    vec2 capsuleAxis = capsuleEnd - capsuleStart;
    float capsuleLength = length(capsuleAxis);
    if (capsuleLength > 0.0) {
      vec2 toPoint = pixelCoord - capsuleStart;
      float t = clamp(dot(toPoint, capsuleAxis) / dot(capsuleAxis, capsuleAxis), 0.0, 1.0);
      vec2 closestPointOnAxis = capsuleStart + t * capsuleAxis;
      return length(pixelCoord - closestPointOnAxis) - radius;
    } else {
      return length(pixelCoord - center) - radius;
    }
  }

  void main() {
    vec2 coord = v_texcoord;

    // Glass shape border distance
    float distFromEdgeShape;

    if (isPill(u_resolution, u_borderRadius)) {
      distFromEdgeShape = -pillDistance(coord, u_resolution, u_borderRadius);
    } else if (isCircle(u_resolution, u_borderRadius)) {
      distFromEdgeShape = -circleDistance(coord, u_resolution, u_borderRadius);
    } else {
      distFromEdgeShape = -roundedRectDistance(coord, u_resolution, u_borderRadius);
    }

    distFromEdgeShape = max(distFromEdgeShape, 0.0);

    // Corner proximity & corner boost
    float distFromLeft = coord.x;
    float distFromRight = 1.0 - coord.x;
    float distFromTop = coord.y;
    float distFromBottom = 1.0 - coord.y;
    float cornerProximityX = min(distFromLeft, distFromRight);
    float cornerProximityY = min(distFromTop, distFromBottom);
    float cornerDistance = max(cornerProximityX, cornerProximityY);
    float cornerNormalized = cornerDistance * min(u_resolution.x, u_resolution.y);
    float cornerBoost = exp(-cornerNormalized * 0.3) * u_cornerBoost * 2.5;

    // Physical warm fire rim light along outer perimeter (GLSL ES 1.00 compliant)
    float rimFactor = (1.0 - smoothstep(0.5, 2.5, distFromEdgeShape)) * u_rimIntensity * 2.5;
    
    // Subtle inner bevel refraction highlight (optical glass edge definition)
    float innerBevel = (1.0 - smoothstep(1.5, 5.0, distFromEdgeShape)) * u_edgeIntensity * 2.0;

    // Top-to-bottom optical glass gradient
    float topReflect = max(0.0, 1.0 - coord.y * 3.0) * (1.0 - smoothstep(0.5, 6.0, distFromEdgeShape)) * 0.12;

    // Composite liquid glass material overlay:
    // Pure transparent in the interior so the live native CSS backdrop-filter shines through!
    // Optical rim, fire accents, and corner refractions along the edges and corners!
    vec3 rimLight = u_rimColor * (rimFactor + innerBevel);
    vec3 cornerLight = vec3(1.0, 0.65, 0.25) * cornerBoost;
    vec3 specularHighlight = vec3(1.0, 0.95, 0.9) * topReflect;

    vec3 finalColor = rimLight + cornerLight + specularHighlight;
    float totalAlpha = clamp(rimFactor + innerBevel + cornerBoost + topReflect, 0.0, 0.90);

    // Shape mask to conform perfectly to container borderRadius
    float maskDistance;
    if (isPill(u_resolution, u_borderRadius)) {
      maskDistance = pillDistance(coord, u_resolution, u_borderRadius);
    } else if (isCircle(u_resolution, u_borderRadius)) {
      maskDistance = circleDistance(coord, u_resolution, u_borderRadius);
    } else {
      maskDistance = roundedRectDistance(coord, u_resolution, u_borderRadius);
    }
    float mask = 1.0 - smoothstep(-0.8, 0.8, maskDistance);

    gl_FragColor = vec4(finalColor, totalAlpha * mask);
  }
`;

export const nestedFragmentShaderSource = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_borderRadius;
  uniform float u_edgeIntensity;
  uniform float u_rimIntensity;
  uniform float u_cornerBoost;
  uniform vec3 u_rimColor;
  varying vec2 v_texcoord;

  float roundedRectDistance(vec2 coord, vec2 size, float radius) {
    vec2 center = size * 0.5;
    vec2 pixelCoord = coord * size;
    vec2 toCorner = abs(pixelCoord - center) - (center - radius);
    float outsideCorner = length(max(toCorner, 0.0));
    float insideCorner = min(max(toCorner.x, toCorner.y), 0.0);
    return (outsideCorner + insideCorner - radius);
  }

  void main() {
    vec2 coord = v_texcoord;
    float dist = max(-roundedRectDistance(coord, u_resolution, u_borderRadius), 0.0);

    // Rim lighting (GLSL ES 1.00 compliant)
    float rimFactor = (1.0 - smoothstep(0.4, 2.2, dist)) * u_rimIntensity * 2.2;
    vec3 finalColor = u_rimColor * rimFactor;

    float mask = 1.0 - smoothstep(-0.8, 0.8, roundedRectDistance(coord, u_resolution, u_borderRadius));
    gl_FragColor = vec4(finalColor, rimFactor * mask);
  }
`;
