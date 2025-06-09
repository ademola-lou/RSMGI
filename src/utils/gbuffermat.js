import * as THREE from 'three';

export class GBufferMaterial extends THREE.RawShaderMaterial {
    constructor() {
        super({
    vertexShader: `
            in vec3 position;
			in vec3 normal;
            in vec3 color;
			in vec2 uv;

			out vec3 vNormal;
            out vec3 vPosition;
            out vec3 vColor;
			out vec2 vUv;

			uniform mat4 modelViewMatrix;
            uniform mat4 viewMatrix;
			uniform mat4 projectionMatrix;
			uniform mat3 normalMatrix;

			void main() {

				vUv = uv;

				// get smooth normals
				vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );

				vec3 transformedNormal = normalMatrix * normal;
				vNormal = normalize( transformedNormal );
                vPosition = mvPosition.xyz;
                vColor = color;
                gl_Position = projectionMatrix * mvPosition;
			}
    `,
    fragmentShader: `
            precision highp float;
			precision highp int;

			layout(location = 0) out vec4 gPosition;
			layout(location = 1) out vec4 gNormal;

			in vec3 vNormal;
			in vec3 vPosition;
			in vec2 vUv;
			in vec3 vColor;

            uniform float near;
            uniform float far;
            uniform vec3 cameraPosition;
            uniform vec3 lightPosition;
            uniform vec3 lightColor;

            float linearizeDepth(float z) {
                return (2.0 * near) / (far + near - z * (far - near));	
            }

            void main() {

                // write color to G-Buffer
                float depth = linearizeDepth(length( vPosition ));

                //write position to G-Buffer and add depth
                gPosition = vec4(vPosition, depth);
                
                // write normals to G-Buffer
                gNormal = vec4( normalize( vNormal ), 0.0 );
            }
        `,
            uniforms: {},
            side: THREE.DoubleSide,
            glslVersion: THREE.GLSL3,
        })

    }
}

// export class GBufferMaterial extends THREE.MeshStandardMaterial {
//     constructor() {
//         super();
//         this.onBeforeCompile = (shader) => {
//             shader.glslVersion = THREE.GLSL3;
//             shader.vertexShader = shader.vertexShader.replace(
//                 "void main() {\n",
//                 `
//                 varying vec3 vPosition;
//                 varying vec3 vNormal;
                
//                 void main(){
//                   vPosition = (modelViewMatrix * vec4(position, 1.)).xyz;
//                   vNormal = normalize(normalMatrix * normal);
//                 `
//             );
//             shader.fragmentShader = shader.fragmentShader.replace(
//                 "void main() {\n",
//                 `
//                 varying vec3 vPosition;
//                 varying vec3 vNormal;
//                 `
//             );
//         }
//     }
// }
