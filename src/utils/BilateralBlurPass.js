import * as THREE from 'three';
import { BilateralBlurMaterial } from './bilateralBlurMaterial.js';

export class BilateralBlurPass {
    constructor(width, height, near, far) {
        this.width = width;
        this.height = height;
        
        // Create materials for both passes
        this.horizontalMaterial = new BilateralBlurMaterial();
        this.verticalMaterial = new BilateralBlurMaterial();
        
        // Set blur directions
        this.horizontalMaterial.setBlurDirection(0); // Horizontal
        this.verticalMaterial.setBlurDirection(1);   // Vertical

        this.horizontalMaterial.setNearFar(near, far);
        this.verticalMaterial.setNearFar(near, far);
        
        // Create render targets
        this.tempRenderTarget = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        });
        
        this.outputRenderTarget = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType
        });
        
        // Create full-screen quad
        this.quad = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            this.horizontalMaterial
        );
        
        // Create camera for full-screen rendering
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.scene = new THREE.Scene();
        this.scene.add(this.quad);

        //copy quad for blur pass for blurred texture
        this.copyQuad = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.MeshBasicMaterial({ map: null })
        );
        this.copyScene = new THREE.Scene();
        this.copyScene.add(this.copyQuad);
        this.copyCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    }
    
    render(renderer, inputTexture, depthTexture, normalTexture, camera) {
        // First pass: Horizontal blur
        this.quad.material = this.horizontalMaterial;
        this.horizontalMaterial.setMainColorTexture(inputTexture);
        this.horizontalMaterial.setDepthTexture(depthTexture);
        this.horizontalMaterial.setNormalTexture(normalTexture);
        this.horizontalMaterial.setResolution(this.width, this.height);
        this.horizontalMaterial.updateMatrices(camera);
        
        renderer.setRenderTarget(this.tempRenderTarget);
        renderer.render(this.scene, this.camera);
        
        // Second pass: Vertical blur
        this.quad.material = this.verticalMaterial;
        this.verticalMaterial.setMainColorTexture(this.tempRenderTarget.texture);
        this.verticalMaterial.setDepthTexture(depthTexture);
        this.verticalMaterial.setNormalTexture(normalTexture);
        this.verticalMaterial.setResolution(this.width, this.height);
        this.verticalMaterial.updateMatrices(camera);
        
        renderer.setRenderTarget(this.outputRenderTarget);
        renderer.render(this.scene, this.camera);
        
        renderer.setRenderTarget(null);
        renderer.clear();
        
        return this.outputRenderTarget.texture;
    }
    
    setSize(width, height) {
        this.width = width;
        this.height = height;
        
        this.tempRenderTarget.setSize(width, height);
        this.outputRenderTarget.setSize(width, height);
        
        this.horizontalMaterial.setResolution(width, height);
        this.verticalMaterial.setResolution(width, height);
    }
    
    dispose() {
        this.tempRenderTarget.dispose();
        this.outputRenderTarget.dispose();
        this.horizontalMaterial.dispose();
        this.verticalMaterial.dispose();
        this.quad.geometry.dispose();
    }

    setDepthSensitivity(sensitivity) {
        this.horizontalMaterial.setDepthSensitivity(sensitivity);
        this.verticalMaterial.setDepthSensitivity(sensitivity);
    }
} 