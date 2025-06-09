import * as THREE from 'three';

export class QuadMat extends THREE.ShaderMaterial {
    constructor(uniforms, use_hammersley = false) {
    super({
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        precision highp float;
        precision highp int;

        #define TWO_PI 6.28318530718
        
        varying vec2 vUv;
        uniform sampler2D tAlbedo;
        uniform sampler2D tDepth;
        uniform sampler2D tNormal;
        uniform sampler2D tPosition;
        uniform sampler2D tRSMPosition;
        uniform sampler2D tRSMNormal;
        uniform sampler2D tRSMFlux;
        uniform float rsmRadius;
        uniform float rsmIntensity;
        uniform vec2 rsmSize;
        uniform int debugOutput;
        uniform float brightness;
        uniform int samples;
        uniform mat4 lightProjMatrix;
        uniform mat4 lightViewMatrix;
        uniform vec3 lightPosition;
        uniform vec3 lightDirection;
        uniform mat4 projectionMatrixInverse;
        uniform mat4 viewMatrixInverse;
        uniform float edgeCorrection;
        uniform vec3 pattern[${uniforms.samples.value}];
        uniform float ambientIntensity;
        
        float random(vec2 n, float offset ){
            return .5 - fract(sin(dot(n.xy + vec2( offset, 0. ), vec2(12.9898, 78.233)))* 43758.5453);
        }

        float rand(in float n){
            return fract(sin(n) * 43758.5453123);
        }
        vec3 worldCoordinatesFromDepth(float depth, vec2 vUv) {
            float z = depth * 2.0 - 1.0;
            vec4 clipSpaceCoordinate = vec4(vUv * 2.0 - 1.0, z, 1.0);
            vec4 viewSpaceCoordinate = projectionMatrixInverse * clipSpaceCoordinate;
            viewSpaceCoordinate /= viewSpaceCoordinate.w;
            vec4 worldSpaceCoordinates = viewMatrixInverse * viewSpaceCoordinate;
            return worldSpaceCoordinates.xyz;
        }
        
        // Hammersley sequence generation
        uint radicalInverse_VdC(uint i) {
            uint b =  ( uint(i) << 16u) | (uint(i) >> 16u );
            b = (b & 0x55555555u) << 1u | (b & 0xAAAAAAAAu) >> 1u;
            b = (b & 0x33333333u) << 2u | (b & 0xCCCCCCCCu) >> 2u;
            b = (b & 0x0F0F0F0Fu) << 4u | (b & 0xF0F0F0F0u) >> 4u;
            b = (b & 0x00FF00FFu) << 8u | (b & 0xFF00FF00u) >> 8u;
            return b;
        }

        vec2 hammersley(uint i, uint N) {
             return vec2(
                float(i) / float(N),
                float(radicalInverse_VdC(i)) * 2.3283064365386963e-10
            );
        }

        mat2 getRotationMatrix(float angle) {
            float c = cos(angle);
            float s = sin(angle);
            return mat2(c, s, -s, c);
        }
        vec3 calculateRSMIndirectLighting(vec3 worldPos, vec3 worldNormal, vec3 albedo) {
            vec3 indirectLight = vec3(0.0);
            
            // Transform world position to light space
            vec4 lightSpacePos = lightProjMatrix * lightViewMatrix * vec4(worldPos, 1.0);
            lightSpacePos /= lightSpacePos.w;
            vec2 lightUV = lightSpacePos.xy * 0.5 + 0.5;
            
            // Skip if outside light frustum
            if(lightUV.x < 0.0 || lightUV.x > 1.0 || lightUV.y < 0.0 || lightUV.y > 1.0) {
                return indirectLight;
            }
        
            float totalWeight = 0.0;
        #ifdef USE_HAMMERSLEY
                float rotAngle = random(vUv, 0.0) * TWO_PI;
                mat2 rotMatrix = getRotationMatrix(rotAngle);
                float frameJitter = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
                for(int i = 0; i < samples; i++) {
                    // // Generate Hammersley sample with temporal jitter (following image pattern)
                    vec2 xi = hammersley(uint(i), uint(samples));
                    // xi = fract(xi + frameJitter);
                    xi = (rotMatrix * (xi - 0.5)) + 0.5;
                    
                    // Convert to polar coordinates for RSM sampling (as shown in image)
                    float r = xi.x * rsmRadius; // Use xi.x for radial distance
                    float theta = xi.y * TWO_PI; // Use xi.y for angle
                    float weight = xi.x * xi.x; // Quadratic weighting for area compensation
                    
                    // Convert polar to UV coordinates for RSM sampling
                    vec2 pixelLightUV = lightUV + vec2(r * cos(theta), r * sin(theta)) / rsmSize.x;
                    pixelLightUV = clamp(pixelLightUV, 0.0, 1.0);
                    
                    // Sample RSM data
                    vec3 rsmWorldPos = texture(tRSMPosition, pixelLightUV).xyz;
                    vec3 rsmNormal = normalize(texture(tRSMNormal, pixelLightUV).xyz * 2.0 - 1.0);
                    vec3 rsmFlux = texture(tRSMFlux, pixelLightUV).rgb;
                    
                    // Check if RSM sample has valid data
                    if(length(rsmFlux) < 0.001) continue; // Skip empty/dark samples
                    
                    // Calculate vector from current pixel to RSM sample
                    vec3 correctedWorldPos = rsmWorldPos + rsmNormal * edgeCorrection;
                    vec3 rVector = correctedWorldPos - worldPos;
                    float rDistance = length(rVector);
                    
                    if(rDistance < 0.01) continue; // Skip if too close
                    
                    vec3 rDirection = rVector / rDistance;
                    
                    // Calculate geometric term (cosines and distance falloff)
                    float cosTheta_p = max(0.0, dot(worldNormal, rDirection));
                    float cosTheta_q = max(0.0, dot(rsmNormal, -rDirection));
                    
                    // For directional light, we can use a more uniform falloff
                    float falloff = 1.0 / dot(rDirection, rDirection);
                    
                    // RSM contribution formula adapted for directional light
                    vec3 contribution = rsmFlux * cosTheta_p * cosTheta_q * falloff;
                    indirectLight += contribution * weight;
                    totalWeight += 1.;
                }
        #else
        
            for(int i = 0; i < samples; i++) {
                // Generate random sample point in RSM around the light-space position
                vec2 randomOffset = vec2(
                    random(vUv, float(i)),
                    random(vUv, float(i) + 100.0)
                );
                
                // randomOffset = (randomOffset - 0.5) * 2.0; // Convert to [-1, 1]
                // float weight = randomOffset.x * randomOffset.x;
                
                vec2 rsmUV = lightUV + randomOffset * rsmRadius / rsmSize;
                if(rsmUV.x < 0.0 || rsmUV.x > 1.0 || rsmUV.y < 0.0 || rsmUV.y > 1.0) continue;
                
                // Sample RSM data
                vec3 rsmWorldPos = texture(tRSMPosition, rsmUV).xyz;
                vec3 rsmNormal = normalize(texture(tRSMNormal, rsmUV).xyz * 2.0 - 1.0);
                vec3 rsmFlux = texture(tRSMFlux, rsmUV).rgb;
                
                // Calculate vector from current pixel to RSM sample
                vec3 correctedWorldPos = rsmWorldPos + rsmNormal * edgeCorrection;
                vec3 rVector = correctedWorldPos - worldPos;
                float rDistance = length(rVector);
                
                if(rDistance < 0.01) continue; // Skip if too close
                
                vec3 rDirection = rVector / rDistance;
                
                // Calculate geometric term (cosines and distance falloff)
                float cosTheta_p = max(0.0, dot(worldNormal, rDirection));
                float cosTheta_q = max(0.0, dot(rsmNormal, -rDirection));
                
                // For directional light, we can use a more uniform falloff
                // or adjust based on the orthographic nature of the projection
                float distanceSquared = dot(rDirection, rDirection);
                float falloff = 1.0 / (1.0 + distanceSquared);
                //(distanceSquared * distanceSquared); // Reduced falloff factor
                
                // RSM contribution formula adapted for directional light
                // The flux is already pre-multiplied by the directional light intensity
                vec3 contribution = rsmFlux * cosTheta_p * cosTheta_q * falloff;
                indirectLight += contribution * rsmIntensity;
                totalWeight += 1.;
            }
            #endif
            // indirectLight = indirectLight / totalWeight;
            // indirectLight = indirectLight * rsmIntensity;
            // indirectLight = clamp(indirectLight, 0.0, 1.0);
            return indirectLight;
        }

        void main() {
            gl_FragColor.a = 1.0;

            //display result from normal gbuffer
            vec3 albedo = texture(tAlbedo, vUv).rgb;
            vec3 normal = normalize(texture(tNormal, vUv).rgb * 2.0 - 1.0);

            float depth = texture(tDepth, vUv).r;

            if(depth >= 1.0) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }
            vec3 worldPosition = worldCoordinatesFromDepth(depth, vUv);

            if(debugOutput == 1){
                gl_FragColor.rgb = albedo;
                return;
            }
            if(debugOutput == 2){
                gl_FragColor.rgb = normal;
                return;
            }
            
            if(debugOutput == 3){
                gl_FragColor.rgb = vec3(depth);
                return;
            }
            
            if(debugOutput == 4){
                gl_FragColor.rgb = worldPosition;
                return;
            }

            if(debugOutput == 5){
                gl_FragColor.rgb = texture(tRSMNormal, vUv).rgb;
                return;
            }

            if(debugOutput == 6){
                gl_FragColor.rgb = texture(tRSMPosition, vUv).rgb;
                return;
            }

            if(debugOutput == 7){
                gl_FragColor.rgb = texture(tRSMFlux, vUv).rgb;
                return;
            }
                
            // Calculate direct lighting
            // vec3 directLight = vec3(max(dot(normal, normalize(lightPosition - worldPosition)), 0.0));
            // directLight = mix(directLight, albedo, 0.5);

            vec3 indirectLight = vec3(0.0);
            indirectLight = calculateRSMIndirectLighting(worldPosition, normal, albedo);
            
            if(debugOutput == 8){
                gl_FragColor.rgb = indirectLight;
                return;
            }

            // Calculate ambient contribution
            vec3 ambient = vec3(ambientIntensity) * albedo.rgb;
            
            // Combine indirect lighting with ambient lighting
            vec3 final = (indirectLight.rgb * albedo.rgb / float(samples)) + ambient;
            gl_FragColor = vec4(final * brightness, 1.0);

            #include <tonemapping_fragment>
            #include <colorspace_fragment>
        }
    `,
    uniforms,
    defines: {
        USE_HAMMERSLEY: use_hammersley
    }
    })

    // const PATTERN = [];
    // for (let i = 0; i < uniforms.samples.value; i++) {
        // var xi1 = Math.random()
        // var xi2 = Math.random()
      
        // var x = xi1 * Math.sin(2 * Math.PI * xi2)
        // var y = xi1 * Math.cos(2 * Math.PI * xi2)
      
        // // we need xi1 for weighting, so include with sample.
        // PATTERN.push(new THREE.Vector3(x, y, xi1))
    // }
    // this.uniforms.pattern = { value: PATTERN };
    // // Flatten the PATTERN array into a Float32Array
    // const data = new Float32Array(samples * 4); // Use 4 components (RGBA) instead of 3 (RGB)
    // for (let i = 0; i < samples; i++) {
    //     data[i * 4 + 0] = PATTERN[i].x; // x
    //     data[i * 4 + 1] = PATTERN[i].y; // y
    //     data[i * 4 + 2] = PATTERN[i].z; // z (weight)
    //     data[i * 4 + 3] = 1.0; // Alpha (set to 1.0, or use for another value if needed)
    // }

    // // Create the DataTexture with RGBAFormat
    // const textureWidth = samples;
    // const textureHeight = 1;
    // const dataTexture = new THREE.DataTexture(
    //     data,
    //     textureWidth,
    //     textureHeight,
    //     THREE.RGBAFormat, // Use RGBA instead of RGB to support FloatType
    //     THREE.FloatType
    // );

    // // Disable mipmapping to avoid LOD errors
    // dataTexture.minFilter = THREE.LinearFilter; // Or THREE.NearestFilter
    // dataTexture.magFilter = THREE.LinearFilter; // Or THREE.NearestFilter
    // dataTexture.generateMipmaps = false; // Explicitly disable mipmaps

    // // Update the texture
    // dataTexture.needsUpdate = true;
    // this.uniforms.tPattern = { value: dataTexture };
}
}
