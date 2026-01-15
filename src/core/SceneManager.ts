import * as THREE from 'three';

export interface IScene {
    init(manager: SceneManager): Promise<void>;
    update(time: number, delta: number): void;
    render(renderer: THREE.WebGLRenderer): void;
    resize(width: number, height: number): void;
    dispose(): void;
    ui?: HTMLElement;
}

export class SceneManager {
    private currentScene: IScene | null = null;
    private renderer: THREE.WebGLRenderer;

    constructor(renderer: THREE.WebGLRenderer) {
        this.renderer = renderer;
    }

    public async switchScene(scene: IScene): Promise<void> {
        if (this.currentScene) {
            this.currentScene.dispose();
            if (this.currentScene.ui && document.body.contains(this.currentScene.ui)) {
                document.body.removeChild(this.currentScene.ui);
            }
        }

        this.currentScene = scene;
        await this.currentScene.init(this);

        if (this.currentScene.ui) {
            document.body.appendChild(this.currentScene.ui);
        }
    }

    public update(time: number, delta: number): void {
        if (this.currentScene) {
            this.currentScene.update(time, delta);
            this.currentScene.render(this.renderer);
        }
    }

    public resize(width: number, height: number): void {
        if (this.currentScene) {
            this.currentScene.resize(width, height);
        }
    }
}
