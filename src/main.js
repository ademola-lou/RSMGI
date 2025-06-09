import './style.css'

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { GBufferMaterial } from './utils/gbuffermat.js';
import { RSMBufferMaterial } from './utils/rsmMat.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { QuadRawMat } from './utils/quadRawMat.js';
import { QuadMat } from './utils/quadMat.js';
import { FinalPassMat } from './utils/finalPass.js';
import Stats from 'three/addons/libs/stats.module.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { BilateralBlurPass } from './utils/BilateralBlurPass.js';
let scene, camera, renderer, controls, model,gBufferRenderTarget, gBufferMesh, gBufferMaterial, gui, albedoFBO, secondaryLight, secondaryLightHelper, lightCamera, shadowCamera, cameraHelper, rsmRenderTarget, indirectLightRt, finalPassMesh, finalPassMaterial, transform_control, transform_control_helper, finalScene, movingSphere, rsmSize, stats, lpv, bilateralBlurPass;

let dpr = 1;//window.devicePixelRatio;
const debugTypes = {
    RsmGI: 0,
    Albedo: 1,
    Normal: 2,
    Depth: 3,
    Position: 4,
    RSMNormal: 5,
    RSMPosition: 6,
    RSMFlux: 7,
    IndirectLight: 8,
    Blur: 9
}
const params = {
    debugGBuffer: 'RsmGI',
    loadedModel: "sponza.glb",
    brightness: 2.0,
    samples: 10,
    rsmIntensity: 10.0,
    rsmRadius: 8.0,
    lightIntensity: 2.0,
    edgeCorrection: 0.01,
    depthSensitivity: 1.0,
    lightType: "spot",
    spotLightAngle: 1.16,//Math.PI / 4,
    showSecondaryLightHelper: false,
    showCameraHelper: false,
    use_hammersley_sampling: false,
    control_light_target: false,
    ambientIntensity: 0.02,
    frustumSize: 10,
}

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.4.1/");
const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);

function init() {
    scene = new THREE.Scene();
    finalScene = new THREE.Scene();
    stats = new Stats();
    document.body.appendChild(stats.dom);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 10, 5); // Slightly adjusted camera for better view of cornell box base
    camera.lookAt(0,0,0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio); // Set pixel ratio once
    renderer.setSize(window.innerWidth, window.innerHeight); // Set size based on window
    document.body.appendChild(renderer.domElement);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.enableZoom = true;

    //add ambient and directional light
    const ambientLight = new THREE.AmbientLight(0xffffff, 4.5); // Increased intensity a bit
    scene.add(ambientLight);

    

    transform_control = new TransformControls(camera, renderer.domElement);
    transform_control.size = 0.5;
    transform_control.addEventListener("mouseDown", (e) => {
        controls.enabled = false;
    });
    transform_control.addEventListener("mouseUp", (e) => {
        controls.enabled = true;
    });
    
    transform_control_helper = transform_control.getHelper();
    finalScene.add(transform_control_helper);

    createLight(params.lightType);
    
    gui = new GUI();

    loadModel(params.loadedModel);

    loadGBuffer(lightCamera);

    window.addEventListener('resize', onWindowResize, false);
}

function loadModel(url){
    if(model){
        scene.remove(model);
        model = null;
    }
    loader.load(url, (gltf) => {
        model = gltf.scene;
        model.scale.multiplyScalar(2);
        model.position.y = -1;
        scene.add(model);
        model.traverse(obj => {
            if(obj.isMesh){
                if(obj.name === "Winged_Victory_1" || obj.name === "Object_2001"){
                    obj.position.y += 0.01;
                    obj.castShadow = true;
                    obj.receiveShadow = false;
                } else {
                    obj.material.side = THREE.DoubleSide;
                    obj.receiveShadow = true;
                }
                if(obj.name === "Object_3"){
                    obj.material.color.set("cyan")
                }

                if(obj.name === "Object_8"){
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                }
                if(obj.name === "Object_2" || obj.name === "cornellBox000_2"){
                    obj.material.color.set("yellow")
                }
                if(obj.name === "mesh_0_46"){
                    obj.receiveShadow = true;
                } else {
                    obj.receiveShadow = false;
                    obj.castShadow = true;
                }
            }
        });

        if(params.loadedModel === "sponza.glb"){
            const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
            const sphereMaterial = new THREE.MeshStandardMaterial();
            movingSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            movingSphere.position.set(-4, 2, -6);
            model.attach(movingSphere);
        }
        MeshMaterialRSManager.init();
    })
}

function createLight(lightType){
    if(secondaryLight){
        scene.remove(secondaryLight);
        scene.remove(secondaryLightHelper);
        scene.remove(secondaryLight.target);
        scene.remove(cameraHelper);
    }
    if(lightType === "spot"){
        secondaryLight = new THREE.SpotLight(0xffffff, params.lightIntensity);
        secondaryLight.position.set(-3, 3, 0);
        secondaryLight.angle = params.spotLightAngle;
        scene.add(secondaryLight);
        secondaryLight.castShadow = true;
        secondaryLight.shadow.camera.near = 0.1;
        secondaryLight.shadow.camera.far = 100;
        secondaryLight.shadow.needsUpdate = true;
        secondaryLight.shadow.autoUpdate = true;
        
        secondaryLight.lookAt(new THREE.Vector3());
        
        finalScene.add(secondaryLight);
    
        scene.add(secondaryLight.target);
    
        secondaryLightHelper = new THREE.SpotLightHelper(secondaryLight, 1);
        scene.add(secondaryLightHelper);
        secondaryLightHelper.visible = params.showSecondaryLightHelper;
        
    } else if(lightType === "directional"){
        secondaryLight = new THREE.DirectionalLight(0xffffff, params.lightIntensity);
        secondaryLight.position.set(-3, 3, 0);
        scene.add(secondaryLight);
        secondaryLight.castShadow = true;
        secondaryLight.shadow.camera.near = 0.1;
        secondaryLight.shadow.camera.far = 100;
        //increase shadow camera frustum
        const frustumSize = params.frustumSize;
        secondaryLight.shadow.camera.left = -frustumSize;
        secondaryLight.shadow.camera.right = frustumSize;
        secondaryLight.shadow.camera.top = frustumSize;
        secondaryLight.shadow.camera.bottom = -frustumSize;
        secondaryLight.shadow.needsUpdate = true;
        secondaryLight.shadow.autoUpdate = true;
        
        secondaryLight.lookAt(new THREE.Vector3());
        
        finalScene.add(secondaryLight);
    
        scene.add(secondaryLight.target);
    
        secondaryLightHelper = new THREE.DirectionalLightHelper(secondaryLight, 1);
        scene.add(secondaryLightHelper);
        secondaryLightHelper.visible = params.showSecondaryLightHelper;
    }
    transform_control.attach(secondaryLight);

    lightCamera = secondaryLight.shadow.camera;
    lightCamera.updateMatrixWorld();
    lightCamera.updateProjectionMatrix();

    cameraHelper = new THREE.CameraHelper(lightCamera);
    scene.add(cameraHelper);
    cameraHelper.visible = params.showCameraHelper;
}

function loadGBuffer(lightCamera) {
    albedoFBO = new THREE.WebGLRenderTarget(
        window.innerWidth * dpr, 
        window.innerHeight * dpr,
        {
            count: 1,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType
        }
    );

    gBufferRenderTarget = new THREE.WebGLRenderTarget(
        window.innerWidth * dpr, 
        window.innerHeight * dpr,
        {
            count: 2,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        }
    );
    //name the textures
    gBufferRenderTarget.textures[0].name = 'tAlbedo';
    gBufferRenderTarget.textures[1].name = 'tNormal';
    albedoFBO.depthTexture = new THREE.DepthTexture();
    albedoFBO.depthTexture.format = THREE.DepthFormat;
    albedoFBO.depthTexture.name = 'tDepth';
    albedoFBO.depthTexture.minFilter = THREE.NearestFilter;
    albedoFBO.depthTexture.magFilter = THREE.NearestFilter;


    rsmSize = 128;
    rsmRenderTarget = new THREE.WebGLRenderTarget(
        rsmSize, 
        rsmSize,
        {
            count: 3,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
        }
    );
    rsmRenderTarget.textures[0].name = 'tRSMPosition';
    rsmRenderTarget.textures[1].name = 'tRSMNormal';
    rsmRenderTarget.textures[2].name = 'tRSMFlux';

    indirectLightRt = new THREE.WebGLRenderTarget(
        window.innerWidth * dpr,
        window.innerHeight * dpr,
        {
            count: 2,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
        }
    )

    const debugMaterial = new QuadRawMat({
        tAlbedo: { value: albedoFBO.textures[0] },
        tNormal: { value: gBufferRenderTarget.textures[1] },
        tDepth: { value: albedoFBO.depthTexture },
        tPosition: { value: gBufferRenderTarget.textures[0] },
        tRSMPosition: { value: rsmRenderTarget.textures[0] },
        tRSMNormal: { value: rsmRenderTarget.textures[1] },
        tRSMFlux: { value: rsmRenderTarget.textures[2] },
        lightPosition: { value: secondaryLight.position },
        rsmRadius: { value: params.rsmRadius },
        rsmIntensity: { value: params.rsmIntensity },
        rsmSize: { value: new THREE.Vector2(rsmSize, rsmSize) },
        samples: { value: params.samples },
        edgeCorrection: { value: params.edgeCorrection },
        debugOutput: { value: debugTypes.RsmGI },
        projectionMatrixInverse: { value: camera.projectionMatrixInverse },
        viewMatrixInverse: { value: camera.matrixWorld },
        lightProjMatrix: { value: lightCamera.projectionMatrix },
        lightViewMatrix: { value: lightCamera.matrixWorldInverse },
        lightDirection: { value: new THREE.Vector3(0, 0, 0) },
    });
    
    gBufferMesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), debugMaterial);
    gBufferMesh.name = 'gBufferMesh';
    gBufferMesh.frustumCulled = false;
    finalScene.add(gBufferMesh);

    finalPassMaterial = new FinalPassMat({
        tAlbedo: { value: indirectLightRt.textures[0] },
        tIndirectLight: { value: indirectLightRt.textures[1] },
        ambientIntensity: { value: params.ambientIntensity },
        brightness: { value: params.brightness }
    });

    finalPassMaterial.setAmbientIntensity(params.ambientIntensity);
    finalPassMaterial.setBrightness(params.brightness);

    finalPassMesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), finalPassMaterial);
    finalPassMesh.name = 'finalPassMesh';
    finalScene.add(finalPassMesh);
    finalPassMesh.frustumCulled = false;
    finalPassMesh.visible = false;

    gui.add(params, 'debugGBuffer', ['RsmGI', 'Albedo', 'Normal', 'Depth', 'Position', 'RSMNormal', 'RSMPosition', 'RSMFlux', 'IndirectLight', 'Blur']).name('Debug GBuffer View')
    .onChange(v => {
        debugMaterial.uniforms.debugOutput.value = debugTypes[v];
    });

    gui.add(params, 'brightness', 0.0, 2.0, 0.01).name('Brightness').onChange(v => {
        finalPassMaterial.setBrightness(v);
    });

    gui.add(params, 'rsmRadius', 0.0, 50.0, 0.01).name('RSM Radius').onChange(v => {
        debugMaterial.uniforms.rsmRadius.value = v;
    });

    gui.add(params, 'rsmIntensity', 0.0, 100.0, 0.01).name('Indirect Light Intensity').onChange(v => {
        debugMaterial.uniforms.rsmIntensity.value = v;
    });

    gui.add(params, 'samples', 1, 100, 1).name('Samples').onChange(v => {
        debugMaterial.uniforms.samples.value = v;
    });

    gui.add(params, 'depthSensitivity', 0.0, 500.0, 0.01).name('Depth Sensitivity').onChange(v => {
        bilateralBlurPass.setDepthSensitivity(v);
    });

    const lightTypeControl = gui.add(params, 'lightType', ['spot', 'directional']).name('Light Type').onChange(v => {
        createLight(v);
    });

    gui.add(params, 'lightIntensity', 0.0, 100.0, 0.01).name('Light Intensity').onChange(v => {
       secondaryLight.intensity = v;
    });

    gui.add(params, 'spotLightAngle', 0.0, Math.PI, 0.01).name('Spot Light Angle').onChange(v => {
        if(secondaryLight.type === "SpotLight"){
            secondaryLight.angle = v;
        }
    });

    gui.add(params, 'ambientIntensity', 0.0, 1.0, 0.01).name('Ambient Intensity').onChange(v => {
        finalPassMaterial.setAmbientIntensity(v);
    });

    gui.add(params, 'edgeCorrection', 0.0, 1.0, 0.01).name('Edge Correction').onChange(v => {
        debugMaterial.uniforms.edgeCorrection.value = v;
    });

    gui.add(params, 'showSecondaryLightHelper').name('Show Secondary Light Helper').onChange(v => {
        secondaryLightHelper.visible = v;
    });

    gui.add(params, 'showCameraHelper').name('Show Camera Helper').onChange(v => {
        cameraHelper.visible = v;
    });

    gui.add(params, 'use_hammersley_sampling').name('Use Hammersley Sampling?').onChange(v => {
        debugMaterial.defines.USE_HAMMERSLEY = v;
        debugMaterial.needsUpdate = true;
    });

    gui.add(params, 'control_light_target').name('Control Light Target?').onChange(v => {
        if(v){
            transform_control.attach(secondaryLight.target);
        } else {
            transform_control.attach(secondaryLight);
        }
    });
    
    const frustumSizeControl = gui.add(params, 'frustumSize', 10, 1000, 10).name('Shadow Frustum Size').onChange(v => {
        if(secondaryLight.type === "DirectionalLight"){
            secondaryLight.shadow.camera.left = -v;
            secondaryLight.shadow.camera.right = v;
            secondaryLight.shadow.camera.top = v;
            secondaryLight.shadow.camera.bottom = -v;
        }
    });

    gui.add(params, 'loadedModel', ['sponza.glb', 'levelTest.glb', 'kira.glb']).name('Loaded Model').onChange(v => {
        lightTypeControl.setValue(v === "sponza.glb" ? "spot" : "directional");
        frustumSizeControl.setValue(v === "levelTest.glb" ? 100 : 10);
        loadModel(v);
    });

    gBufferMaterial = new GBufferMaterial();

    bilateralBlurPass = new BilateralBlurPass(window.innerWidth * dpr, window.innerHeight * dpr, camera.near, camera.far);
    bilateralBlurPass.setDepthSensitivity(params.depthSensitivity);
}

//override scene material with rsmBufferMaterial
const MeshMaterialRSManager = {
    obj_cache: [],
    init: function(){
        scene.traverse(obj => {
            if(obj.isMesh){
                if(!obj.userData.originalMaterial){
                    obj.userData.originalMaterial = obj.material;
                    this.obj_cache.push(obj);
                }
            }
        })
    },
    update: function(){
        for(const obj of this.obj_cache){
            lightCamera.updateMatrixWorld();
            lightCamera.updateProjectionMatrix();
            let rsmMaterial = obj.userData.rsmMaterial;
            if(!rsmMaterial){
                rsmMaterial = new RSMBufferMaterial();
                obj.userData.rsmMaterial = rsmMaterial;
            }
            obj.material = rsmMaterial;
            obj.material.uniforms.lightPosition.value.copy(secondaryLight.position);
            obj.material.uniforms.lightProjMatrix.value.copy(lightCamera.projectionMatrix);
            obj.material.uniforms.lightViewMatrix.value.copy(lightCamera.matrixWorldInverse);
            obj.material.uniforms.lightColor.value.copy(secondaryLight.color);
            obj.material.uniforms.useSpotLight.value = secondaryLight.type === "SpotLight";
            obj.material.uniforms.tSurfaceAlbedo.value = obj.userData.originalMaterial.map;
            obj.material.uniforms.surfaceColor.value = obj.userData.originalMaterial.color;
            obj.material.uniforms.hasAlbedo.value = obj.userData.originalMaterial.map ? true : false;
            obj.material.uniforms.rsmSize.value.set(rsmSize, rsmSize);
            obj.material.uniforms.lightDirection.value.copy(secondaryLight.position).normalize().negate();
            obj.material.uniforms.lightAngle.value = secondaryLight.angle;
            obj.material.uniforms.lightIntensity.value = secondaryLight.intensity;
        }
    },

    reset: function(){
        for(const obj of this.obj_cache){
            obj.material = obj.userData.originalMaterial;
        }
    }
}

function onWindowResize() {
    const dpr = renderer.getPixelRatio();
    const newWidth = window.innerWidth;
    const newHeight = window.innerHeight;
    
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(newWidth * dpr, newHeight * dpr);
    gBufferRenderTarget.setSize(newWidth * dpr, newHeight * dpr);
    albedoFBO.setSize(newWidth * dpr, newHeight * dpr);
    indirectLightRt.setSize(newWidth * dpr, newHeight * dpr);
}
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    stats.update();
    if(movingSphere) movingSphere.position.x = Math.sin(clock.getElapsedTime() * 0.5) * 4;
    if(lightCamera){
        lightCamera.updateMatrixWorld();
        gBufferMesh.material.uniforms.lightPosition.value.copy(secondaryLight.position);
        gBufferMesh.material.uniforms.projectionMatrixInverse.value.copy(camera.projectionMatrixInverse);
        gBufferMesh.material.uniforms.viewMatrixInverse.value.copy(camera.matrixWorld);
        gBufferMesh.material.uniforms.lightProjMatrix.value.copy(lightCamera.projectionMatrix);
        gBufferMesh.material.uniforms.lightViewMatrix.value.copy(lightCamera.matrixWorldInverse);
        gBufferMesh.material.uniforms.lightDirection.value.copy(secondaryLight.position).normalize().negate();
    }

    if (gBufferMesh) gBufferMesh.visible = false;
    if (finalPassMesh) finalPassMesh.visible = false;
    if (transform_control_helper) transform_control_helper.visible = false;
    if(params.showSecondaryLightHelper) secondaryLightHelper.update();

    // 2. Render RSM (Reflective Shadow Map) from light's perspective
    MeshMaterialRSManager.update();
    renderer.setRenderTarget(rsmRenderTarget);
    renderer.clear();
    renderer.render(scene, lightCamera);

    // 3. Render albedo from camera's perspective
    MeshMaterialRSManager.reset();
    renderer.setRenderTarget(albedoFBO);
    renderer.clear();
    renderer.render(scene, camera);

    // 4. Render G-Buffer from camera's perspective
    scene.overrideMaterial = gBufferMaterial;
    renderer.setRenderTarget(gBufferRenderTarget);
    renderer.clear();
    renderer.render(scene, camera);

    // 5. Render indirect light pass using QuadMat material
    scene.overrideMaterial = null;
    renderer.setRenderTarget(indirectLightRt);
    renderer.clear();
 

    gBufferMesh.visible = true;
    finalPassMesh.visible = false;
    
    renderer.render(gBufferMesh, camera);


    const blurredTexture = bilateralBlurPass.render(renderer, indirectLightRt.textures[1], albedoFBO.depthTexture, gBufferRenderTarget.textures[1], camera);
    
    //transfer the blurred texture to the copy quad
    bilateralBlurPass.copyQuad.material.map = blurredTexture;
    renderer.render(bilateralBlurPass.copyScene, bilateralBlurPass.copyCamera);

    if(params.debugGBuffer === "Blur"){
        renderer.setRenderTarget(null);
        renderer.render(bilateralBlurPass.copyScene, bilateralBlurPass.copyCamera);
        return;
    }
    // 6. Final composite pass - render to screen
    renderer.setRenderTarget(null);
    
    // Update final pass material uniforms
    if (finalPassMesh && finalPassMesh.material) {
        finalPassMesh.material.uniforms.tAlbedo.value = indirectLightRt.textures[0];
        finalPassMesh.material.uniforms.tIndirectLight.value = blurredTexture;
        finalPassMaterial.setEnableDebug(params.debugGBuffer !== "RsmGI");
    }

    gBufferMesh.visible = false;
    finalPassMesh.visible = true;
    transform_control_helper.visible = true;

    renderer.render(finalScene, camera);
    }

init();
animate();
