import * as THREE from 'three';

export class BilateralBlurMaterial extends THREE.ShaderMaterial {
    constructor(kernelRadius = 32, near = 0.1, far = 1000.0) {
        const KERNEL_RADIUS = kernelRadius;
        const sigma = KERNEL_RADIUS * 0.5;
        const weights = new Float32Array(KERNEL_RADIUS + 1);
        
        // Precompute Gaussian weights
        let weightSum = 0;
        for (let i = 0; i <= KERNEL_RADIUS; i++) {
            weights[i] = Math.exp(-(i * i) / (2.0 * sigma * sigma));
            weightSum += weights[i];
        }
        
        // Normalize weights
        for (let i = 0; i <= KERNEL_RADIUS; i++) {
            weights[i] /= weightSum;
        }
        super({
            vertexShader: `
            varying vec2 vUv;

            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
            `,
            fragmentShader: `
            uniform sampler2D mainColor;
            uniform sampler2D depthTex;
            uniform sampler2D normalTex;
            uniform vec2 resolution;
            uniform int blurDirection; // 0 = horizontal, 1 = vertical
            uniform float gaussianWeights[${KERNEL_RADIUS + 1}];
            uniform mat4 projectionMatrixInverse;
            uniform mat4 viewMatrixInverse;
            uniform float near;
            uniform float far;
            uniform float depthBias;
            varying vec2 vUv;
            
            #define KERNEL_RADIUS ${KERNEL_RADIUS}

            vec3 worldCoordinatesFromDepth(float depth, vec2 vUv) {
                float z = depth * 2.0 - 1.0;
                vec4 clipSpaceCoordinate = vec4(vUv * 2.0 - 1.0, z, 1.0);
                vec4 viewSpaceCoordinate = projectionMatrixInverse * clipSpaceCoordinate;
                viewSpaceCoordinate /= viewSpaceCoordinate.w;
                vec4 worldSpaceCoordinates = viewMatrixInverse * viewSpaceCoordinate;
                return worldSpaceCoordinates.xyz;
            }

            float sdPlane( vec3 p, vec3 n, float h )
            {
                // n must be normalized
                return dot(p,n) + h;
            }
            float depthFalloff(vec3 worldPos, vec3 norm, float c) {
                return exp(-1.0 * depthBias * abs(sdPlane(worldPos, norm, c)));
            }

            void main() {
                vec2 uv = vUv;//(gl_FragCoord.xy / resolution);
                float depth = texture2D(depthTex, uv).r;

                if(depth >= 1.0) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                    return;
                }

                vec4 centerCol = textureLod(mainColor, uv, 0.);
                vec3 normal = (viewMatrixInverse * vec4(texture2D(normalTex, uv).rgb, 0.0)).xyz;
                vec3 worldPos = worldCoordinatesFromDepth(depth, uv);


                vec3 planeNormal = normal;
                float planeConstant = -dot(worldPos, normal);
                vec3 diffuseSum = vec3( 0.0 );
                float weightSum = 0.0;

                vec2 texelSize = 1.0 / resolution;
                vec2 blurDirection2D = blurDirection == 0 ? vec2(texelSize.x, 0.0) : vec2(0.0, texelSize.y);

                for(int i = 0; i <= KERNEL_RADIUS; i++) {
                    vec2 sampleUV1 = uv + float(i) * blurDirection2D;
                    vec2 clipRangeCheck = step(vec2(0.0),sampleUV1.xy) * step(sampleUV1.xy, vec2(1.0));
                    float w = gaussianWeights[i] * depthFalloff(worldCoordinatesFromDepth(texture2D(depthTex, sampleUV1).r, sampleUV1), planeNormal, planeConstant) * clipRangeCheck.x * clipRangeCheck.y;
                    diffuseSum += texture2D(mainColor, sampleUV1).rgb * w ;
                    weightSum += w;

                    vec2 sampleUV2 = uv - float(i) * blurDirection2D;
                    clipRangeCheck = step(vec2(0.0),sampleUV2.xy) * step(sampleUV2.xy, vec2(1.0));
                    w = gaussianWeights[i] * depthFalloff(worldCoordinatesFromDepth(texture2D(depthTex, sampleUV2).r, sampleUV2), planeNormal, planeConstant) * clipRangeCheck.x * clipRangeCheck.y;
                    diffuseSum += texture2D(mainColor, sampleUV2).rgb * w ;
                    weightSum += w;
                }

                vec3 indirectLighting = diffuseSum / weightSum;
                gl_FragColor = vec4(indirectLighting, 1.0);
            }
            `,
            uniforms: {
                mainColor: { value: null },
                depthTex: { value: null },
                normalTex: { value: null },
                resolution: { value: new THREE.Vector2(1024, 1024) },
                blurDirection: { value: 0 }, // 0 = horizontal, 1 = vertical
                gaussianWeights: { value: weights },
                projectionMatrixInverse: { value: new THREE.Matrix4() },
                viewMatrixInverse: { value: new THREE.Matrix4() },
                near: { value: near },
                far: { value: far },
                depthBias: { value: 0.5 }
            }
        });
    }
    
    setMainColorTexture(texture) {
        this.uniforms.mainColor.value = texture;
    }
    
    setDepthTexture(texture) {
        this.uniforms.depthTex.value = texture;
    }

    setNormalTexture(texture) {
        this.uniforms.normalTex.value = texture;
    }
    
    setResolution(width, height) {
        this.uniforms.resolution.value.set(width, height);
    }
    
    setBlurDirection(direction) {
        this.uniforms.blurDirection.value = direction;
    }
    
    setDepthSensitivity(sensitivity) {
        this.uniforms.depthBias.value = sensitivity;
    }
    
    setNearFar(near, far) {
        this.uniforms.near.value = near;
        this.uniforms.far.value = far;
    }
    
    updateMatrices(camera) {
        this.uniforms.projectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
        this.uniforms.viewMatrixInverse.value.copy(camera.matrixWorld);
    }
    
    setKernelRadius(radius) {
        // Note: This would require recreating the material with new shader code
        console.warn('Kernel radius change requires material recreation');
    }
}