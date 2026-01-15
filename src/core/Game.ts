import * as THREE from 'three';
import { SceneManager } from './SceneManager';

export class Game {
    private renderer: THREE.WebGLRenderer;
    private sceneManager: SceneManager;
    private lastTime: number = 0;
    private container: HTMLElement;

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) throw new Error(`Container with id ${containerId} not found`);
        this.container = container;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        this.sceneManager = new SceneManager(this.renderer);

        window.addEventListener('resize', this.onResize.bind(this));

        // Start loop
        requestAnimationFrame(this.animate.bind(this));
    }

    public get sceneMgr() {
        return this.sceneManager;
    }

    private onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.renderer.setSize(width, height);
        this.sceneManager.resize(width, height);
    }

    private animate(time: number) {
        requestAnimationFrame(this.animate.bind(this));

        const timeSeconds = time * 0.001;
        const delta = timeSeconds - this.lastTime;
        this.lastTime = timeSeconds;

        this.sceneManager.update(timeSeconds, delta);
    }
}
