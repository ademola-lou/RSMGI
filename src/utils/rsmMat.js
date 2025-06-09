// import * as THREE from 'three';

// export class RSMBufferMaterial extends THREE.RawShaderMaterial {
//     constructor() {
//         super({
//     vertexShader: `
//             in vec3 position;
// 			in vec3 normal;
//             in vec3 color;
// 			in vec2 uv;
            
// 			out vec3 vWorldNormal;
//             out vec3 vWorldPosition;
//             out vec3 vColor;
//             out vec4 vLightSpace;
// 			out vec2 vUv;

//             uniform mat4 projectionMatrix;
//             uniform mat4 viewMatrix;
//             uniform mat4 modelMatrix;
// 			uniform mat3 normalMatrix;
//             uniform mat4 lightProjMatrix;
//             uniform mat4 lightViewMatrix;
//             uniform vec3 lightDirection;

// 			void main() {
//                 vec4 worldPosition = modelMatrix * vec4(position, 1.0);
//                 vWorldPosition = worldPosition.xyz;
//                 vWorldNormal = normalize(normalMatrix * normal);
//                 vUv = uv;
//                 vColor = color;
                
//                 gl_Position = lightProjMatrix * lightViewMatrix * worldPosition;
//                 // projectionMatrix * viewMatrix * worldPosition;
//                 // lightProjMatrix * lightViewMatrix * worldPosition;
// 			}
//     `,
//     fragmentShader: `
//             precision highp float;
//             precision highp int;

//             layout(location = 0) out vec4 rsmPosition;
//             layout(location = 1) out vec4 rsmNormal;  
//             layout(location = 2) out vec4 rsmFlux;
            
//             in vec3 vWorldPosition;
//             in vec3 vWorldNormal;
//             in vec2 vUv;
//             in vec3 vColor;
            
//             uniform vec3 lightDirection;
//             uniform vec3 lightColor;
//             uniform float lightIntensity;
//             uniform vec3 lightPosition;
//             uniform sampler2D tSurfaceAlbedo;
//             uniform mat4 lightProjMatrix;
//             uniform mat4 lightViewMatrix;

//             #ifdef USE_SPOT
//                 uniform float lightAngle;
//             #endif
//             void main() {
//                 // Store world position
//                 rsmPosition = vec4(vWorldPosition, 1.0);
                
//                 // Store world normal (encode from [-1,1] to [0,1])
//                 rsmNormal = vec4(vWorldNormal * 0.5 + 0.5, 1.0);
                
//                 // Calculate flux (outgoing radiance)
//                 vec3 lightDir = normalize(lightPosition - vWorldPosition);
//                 float NdotL = max(0.0, dot(vWorldNormal, lightDir));
//                 NdotL = clamp(NdotL, 0.0, 1.0);


//                 // Calculate flux (outgoing radiance)
//                 vec4 lightSpacePos = lightProjMatrix * lightViewMatrix * vec4(vWorldPosition, 1.0);
//                 lightSpacePos /= lightSpacePos.w;
//                 vec2 lightUV = lightSpacePos.xy * 0.5 + 0.5;

//                 vec3 materialAlbedo = texture(tSurfaceAlbedo, lightUV).rgb; // Default albedo
                
//                 // Calculate flux: incoming light * material reflectance * cosine term
//                 vec3 flux = lightColor * lightIntensity * materialAlbedo;
//                 #ifdef USE_SPOT
//                    float cosAngle = max(0., dot(lightDirection, normalize(vWorldPosition - lightPosition)));
//                    flux = sign(cosAngle - lightAngle) * flux;
//                 #endif
//                 rsmFlux = vec4(flux, 1.0);
//             }
//         `,
//             uniforms: {
//                 lightPosition: { value: new THREE.Vector3(0, 0, 0) },
//                 lightDirection: {value: new THREE.Vector3(0, 0, 0)},
//                 lightColor: {value: new THREE.Color(0xffffff)},
//                 lightIntensity: {value: 2.0},
//                 lightProjMatrix: {value: new THREE.Matrix4()},
//                 lightViewMatrix: {value: new THREE.Matrix4()},
//                 tSurfaceAlbedo: {value: null},
//                 lightAngle: {value: 0.0}
//             },
//             defines: {
//                 USE_SPOT: 0
//             },
//             glslVersion: THREE.GLSL3,
//         })

//     }
// }


import * as THREE from 'three';

export class RSMBufferMaterial extends THREE.RawShaderMaterial {
    constructor() {
        super({
    vertexShader: `
            in vec3 position;
			in vec3 normal;
            in vec3 color;
			in vec2 uv;
            
			out vec3 vWorldNormal;
            out vec3 vColor;
            out vec4 vLightSpacePos;
            out vec4 vWorldDepth;
			out vec2 vUv;
            out vec3 vSurfaceColor;

            uniform mat4 projectionMatrix;
            uniform mat4 viewMatrix;
            uniform mat4 modelMatrix;
			uniform mat3 normalMatrix;
            uniform mat4 lightProjMatrix;
            uniform mat4 lightViewMatrix;
            uniform vec3 lightDirection;

			void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vec4 p = lightProjMatrix * lightViewMatrix * worldPosition;

                vec4 viewPos = lightViewMatrix * worldPosition;
                
                vWorldDepth = vec4(worldPosition.xyz, -viewPos.z);
                
                // Store world normal (encode from [-1,1] to [0,1])
                vWorldNormal = normalize(normalMatrix * normal);
                vWorldNormal = vWorldNormal * 0.5 + 0.5;

                vUv = uv;
                vColor = color;
                
                gl_Position = p;
                vLightSpacePos = p;
			}
    `,
    fragmentShader: `
            precision highp float;
            precision highp int;

            layout(location = 0) out vec4 rsmPosition;
            layout(location = 1) out vec4 rsmNormal;  
            layout(location = 2) out vec4 rsmFlux;
            
            in vec4 vLightSpacePos;
            in vec3 vWorldNormal;
            in vec4 vWorldDepth;
            in vec2 vUv;
            in vec3 vColor;
            
            uniform vec3 lightDirection;
            uniform vec3 lightColor;
            uniform float lightIntensity;
            uniform vec3 lightPosition;
            uniform sampler2D tSurfaceAlbedo;
            uniform vec3 surfaceColor;
            uniform mat4 lightProjMatrix;
            uniform mat4 lightViewMatrix;
            uniform bool hasAlbedo;
            uniform bool useSpotLight;
            uniform float lightAngle;
            uniform vec2 rsmSize;

            void main() {
                // Store world position
                rsmPosition = vWorldDepth;
                
                // Store world normal
                rsmNormal = vec4(vWorldNormal, 1.0);


                // // Get albedo from surface albedo render target
                // vec2 lightUV = gl_FragCoord.xy / rsmSize;

                // Use the object's own material texture directly
                vec3 materialAlbedo = hasAlbedo ? texture(tSurfaceAlbedo, vUv).rgb : surfaceColor;
                
                // calculate outgoing radiance
                vec3 lightDir = normalize(lightPosition - vWorldDepth.xyz);
                float NdotL = max(0.0, dot(vWorldNormal, lightDir));
                NdotL = clamp(NdotL, 0.0, 1.0);
                float d = length(vLightSpacePos.xy);
                float lightRadius = tan(lightAngle);
                float innerRadius = lightRadius * 0.9;
                float mask = 1. - smoothstep(innerRadius, lightRadius, d);
                
                // Calculate flux: incoming light * material reflectance * cosine term
                vec3 flux = lightColor * lightIntensity * materialAlbedo;

                if(useSpotLight){
                   float cosAngle = max(0., dot(lightDirection, normalize(vWorldDepth.xyz - lightPosition)));
                   float cosLightAngle  = cos(lightAngle);
                   mask = smoothstep(cosLightAngle, cosLightAngle + 0.01, cosAngle);
                   flux = flux * mask;
                }
                rsmFlux = vec4(flux, 1.0);
            }
        `,
            uniforms: {
                lightPosition: { value: new THREE.Vector3(0, 0, 0) },
                lightDirection: {value: new THREE.Vector3(0, 0, 0)},
                lightColor: {value: new THREE.Color(0xffffff)},
                lightIntensity: {value: 2.0},
                lightProjMatrix: {value: new THREE.Matrix4()},
                lightViewMatrix: {value: new THREE.Matrix4()},
                tSurfaceAlbedo: {value: null},
                lightAngle: {value: 0.0},
                hasAlbedo: {value: true},
                useSpotLight: {value: false},
                rsmSize: {value: new THREE.Vector2(128, 128)},
                surfaceColor: {value: new THREE.Color(0xffffff)},
            },
            side: THREE.DoubleSide,
            glslVersion: THREE.GLSL3,
        })

    }
}
