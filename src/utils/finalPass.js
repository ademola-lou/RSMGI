import * as THREE from 'three';

export class FinalPassMat extends THREE.ShaderMaterial {
    constructor(uniforms) {
        super({
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(uv * 2. - 1., 0.0, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                precision highp int;
                uniform sampler2D tAlbedo;
                uniform sampler2D tIndirectLight;
                uniform float ambientIntensity;
                uniform float brightness;
                uniform bool enableDebug;
                varying vec2 vUv;

                void main() {
                    vec3 albedo = texture2D(tAlbedo, vUv).rgb;
                    if(enableDebug){
                        gl_FragColor = vec4(albedo, 1.0);
                        return;
                    }
                    vec3 indirectLight = texture2D(tIndirectLight, vUv).rgb;
                    vec3 ambient = vec3(ambientIntensity) * albedo.rgb;
                    vec3 final = (indirectLight * albedo) + ambient;
                    gl_FragColor = vec4(final * brightness, 1.0);

                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }
            `,
            uniforms: {
                tAlbedo: { value: null },
                tIndirectLight: { value: null },
                ambientIntensity: { value: 0.0 },
                brightness: { value: 1.0 },
                enableDebug: { value: false }
            }
        });
    }
    setAmbientIntensity(value) {
        this.uniforms.ambientIntensity.value = value;
    }
    setBrightness(value) {
        this.uniforms.brightness.value = value;
    }
    setEnableDebug(value) {
        this.uniforms.enableDebug.value = value;
    }
}