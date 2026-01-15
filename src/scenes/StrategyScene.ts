import * as THREE from 'three';
import gsap from 'gsap';
import type { IScene, SceneManager } from '../core/SceneManager';
import { gameStore } from '../state/gameState';
import type { Province, TaxLevel } from '../state/gameState';
import { BattleScene } from './BattleScene';
import mapTextureUrl from '../assets/map_texture.png';

export class StrategyScene implements IScene {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private raycaster: THREE.Raycaster;
    private mouse: THREE.Vector2;

    private mapPlane: THREE.Mesh;
    private provinceMarkers: Map<string, THREE.Object3D> = new Map();
    private hoveredProvinceId: string | null = null;

    private manager: SceneManager | null = null;
    public ui: HTMLElement;
    private cleanupParams: (() => void)[] = [];

    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e); // Deep blue/black space
        this.scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);

        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.set(0, 15, 10);
        this.camera.lookAt(0, 0, 0);

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffccaa, 1);
        dirLight.position.set(5, 10, 5);
        this.scene.add(dirLight);

        // Map Base (The World)
        const geometry = new THREE.PlaneGeometry(30, 30);
        const textureLoader = new THREE.TextureLoader();
        const mapTexture = textureLoader.load(mapTextureUrl);
        mapTexture.colorSpace = THREE.SRGBColorSpace;

        const material = new THREE.MeshStandardMaterial({
            map: mapTexture,
            roughness: 0.8,
            metalness: 0.1,
        });
        this.mapPlane = new THREE.Mesh(geometry, material);
        this.mapPlane.rotation.x = -Math.PI / 2;
        this.scene.add(this.mapPlane);

        // Grid Helper
        const grid = new THREE.GridHelper(30, 30, 0x555555, 0x222222);
        this.scene.add(grid);

        // Create UI Container
        this.ui = document.createElement('div');
        this.ui.style.position = 'absolute';
        this.ui.style.top = '0';
        this.ui.style.left = '0';
        this.ui.style.width = '100%';
        this.ui.style.height = '100%';
        this.ui.style.pointerEvents = 'none'; // Let clicks pass through to canvas
        this.ui.className = 'ui-layer';
        this.ui.innerHTML = `
      <div id="main-hud">
        <div>
            <h1>CENTURION</h1>
            <div id="stats-area">
                <span><span class="stat-label">Year:</span> <span id="year-display">270 BC</span></span>
                <span><span class="stat-label">Treasury:</span> <span id="treasury-display">1000</span></span>
                <span style="margin-left: 20px;"><span class="stat-label">Tax:</span> <span id="tax-display" style="cursor: pointer; text-decoration: underline; pointer-events: auto;">NORMAL</span></span>
            </div>
        </div>
        <button id="end-turn-btn" class="roman-btn" style="pointer-events: auto;">End Turn</button>
      </div>
      
      <div id="province-panel" class="roman-panel hidden">
        <h2 id="prov-name">Province</h2>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
            <div>
                <div class="stat-label">Owner</div>
                <div id="prov-owner" class="stat-value">-</div>
            </div>
            <div>
                <div class="stat-label">Wealth</div>
                <div id="prov-wealth" class="stat-value">-</div>
            </div>
            <div>
                <div class="stat-label">Manpower</div>
                <div id="prov-manpower" class="stat-value">-</div>
            </div>
            <div>
                <div class="stat-label">Happiness</div>
                <div id="prov-happiness" class="stat-value">-</div>
            </div>
             <div>
                <div class="stat-label">Legions</div>
                <div id="prov-army" class="stat-value">-</div>
            </div>
        </div>
        <div style="display: flex; gap: 10px;">
            <button id="attack-btn" class="roman-btn" style="flex: 1;">Conquer</button>
            <button id="recruit-btn" class="roman-btn" style="flex: 1; display: none;">Recruit (100g)</button>
        </div>
      </div>
    `;

        // Tooltip
        const tooltip = document.createElement('div');
        tooltip.id = 'tooltip';
        tooltip.className = 'roman-tooltip hidden';
        this.ui.appendChild(tooltip);

        // Initialize Markers
        this.initProvinces();

        // Bind Inputs
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('click', this.onClick);

        // Setup UI Listeners
        setTimeout(() => {
            const btn = this.ui.querySelector('#end-turn-btn');
            const handleEndTurn = () => gameStore.getState().actions.endTurn();
            btn?.addEventListener('click', handleEndTurn);
            this.cleanupParams.push(() => btn?.removeEventListener('click', handleEndTurn));

            const taxEl = this.ui.querySelector('#tax-display');
            const handleTax = () => {
                const current = gameStore.getState().taxLevel;
                const levels: TaxLevel[] = ['LOW', 'NORMAL', 'HIGH', 'ABUSIVE'];
                const next = levels[(levels.indexOf(current) + 1) % levels.length];
                gameStore.getState().actions.setTaxLevel(next);
            }
            taxEl?.addEventListener('click', handleTax);
            this.cleanupParams.push(() => taxEl?.removeEventListener('click', handleTax));
        }, 0);

        // Subscribe to State Changes for UI
        const unsubscribe = gameStore.subscribe((state) => {
            const yearEl = this.ui.querySelector('#year-display');
            if (yearEl) yearEl.textContent = `Year: ${state.year} BC`;

            const treasuryEl = this.ui.querySelector('#treasury-display');
            if (treasuryEl) treasuryEl.textContent = state.treasury.toString();

            const taxEl = this.ui.querySelector('#tax-display');
            if (taxEl) taxEl.textContent = state.taxLevel;

            this.updateSelectionUI(state.selectedProvinceId, state.provinces);

            // Re-render markers if owners changed (simplified: just update colors)
            state.provinces.forEach(p => {
                const marker = this.provinceMarkers.get(p.id);
                if (marker) {
                    (marker as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: this.getFactionColor(p.owner) });
                }
            });

            this.checkWinCondition(state.provinces);
        });
        this.cleanupParams.push(unsubscribe);
    }

    private updateTooltip(event: MouseEvent) {
        const tooltip = this.ui.querySelector('#tooltip') as HTMLElement;

        if (this.hoveredProvinceId) {
            const provinces = gameStore.getState().provinces;
            const p = provinces.find(prov => prov.id === this.hoveredProvinceId);

            if (p) {
                tooltip.style.left = event.clientX + 'px';
                tooltip.style.top = event.clientY + 'px';
                tooltip.classList.remove('hidden');

                if (p.owner !== 'ROME') {
                    // Power Ratio Logic
                    // Attacker: 3 Legions * 150HP * 1DMG = 450 Power/Unit ~ (Index)
                    // Defender: N Legions * 100Hp * 0.6DMG = 60 Power/Unit
                    // Ratio: (3 * 2.5) / (p.armySize * 1) roughly.

                    const attackerPower = 3 * 2.5;
                    const defenderPower = p.armySize * 1;
                    const ratio = attackerPower / Math.max(0.1, defenderPower);

                    let ratioText = ratio.toFixed(1) + ":1";
                    let sentiment = "Risky";
                    if (ratio > 2) sentiment = "Easy";
                    else if (ratio > 1.2) sentiment = "Favorable";
                    else if (ratio < 0.8) sentiment = "Suicide";

                    tooltip.innerHTML = `<strong>${p.name}</strong> (${p.owner})<br>Legions: ${p.armySize}<br>Odds: ${ratioText} (${sentiment})`;
                } else {
                    tooltip.innerHTML = `<strong>${p.name}</strong><br>Our Province`;
                }
            }
        } else {
            tooltip.classList.add('hidden');
        }
    }

    private initProvinces() {
        const provinces = gameStore.getState().provinces;
        const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);

        provinces.forEach(p => {
            const material = new THREE.MeshStandardMaterial({ color: this.getFactionColor(p.owner) });
            const marker = new THREE.Mesh(geometry, material);
            marker.position.set(p.position.x, 1, p.position.z);
            marker.userData = { id: p.id }; // Link mesh to data

            this.scene.add(marker);
            this.provinceMarkers.set(p.id, marker);

            // Add label (simple sprite or just rely on UI)
        });
    }

    private getFactionColor(faction: string): number {
        switch (faction) {
            case 'ROME': return 0xcc0000;
            case 'CARTHAGE': return 0xeeeeee;
            case 'BARBARIAN': return 0x00aa00;
            case 'EGYPT': return 0xffaa00;
            default: return 0x999999;
        }
    }

    private onMouseMove = (event: MouseEvent) => {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.updateTooltip(event);
    }

    private onClick = () => {
        if (this.hoveredProvinceId) {
            gameStore.getState().actions.selectProvince(this.hoveredProvinceId);
        } else {
            gameStore.getState().actions.selectProvince(null);
        }
    }

    public async init(manager: SceneManager): Promise<void> {
        this.manager = manager;
        console.log('StrategyScene initialized');

        // Attack Button binding
        const attackBtn = this.ui.querySelector('#attack-btn') as HTMLButtonElement;
        const recruitBtn = this.ui.querySelector('#recruit-btn') as HTMLButtonElement;

        const handleAttack = () => {
            const state = gameStore.getState();
            const selId = state.selectedProvinceId;
            const targetProv = state.provinces.find(p => p.id === selId);

            if (!targetProv || targetProv.owner === 'ROME' || !this.manager) return;

            // Find valid source: Roman neighbor with army > 0
            // Simply find neighbor with MOST legions for now
            const neighbors = state.provinces.filter(p =>
                p.owner === 'ROME' &&
                p.armySize > 0 &&
                targetProv.neighbors && targetProv.neighbors.includes(p.id)
            );

            if (neighbors.length === 0) {
                alert("No neighboring Roman legions available to attack!");
                return;
            }

            // Pick the best source (most troops)
            const sourceProv = neighbors.sort((a, b) => b.armySize - a.armySize)[0];

            // Ask for commitment
            const max = sourceProv.armySize;
            const input = window.prompt(`Attack ${targetProv.name} from ${sourceProv.name}?\nAvailable Legions: ${max}\n\nHow many to commit?`, max.toString());

            if (input === null) return; // Cancel

            const count = parseInt(input);
            if (isNaN(count) || count <= 0 || count > max) {
                alert("Invalid legion count.");
                return;
            }

            // Proceed to Battle
            this.manager.switchScene(new BattleScene(targetProv.id, sourceProv.id, count));
        };

        const handleRecruit = () => {
            const selId = gameStore.getState().selectedProvinceId;
            if (selId) {
                gameStore.getState().actions.recruitLegion(selId);
            }
        }

        attackBtn?.addEventListener('click', handleAttack);
        recruitBtn?.addEventListener('click', handleRecruit);

        this.cleanupParams.push(() => attackBtn?.removeEventListener('click', handleAttack));
        this.cleanupParams.push(() => recruitBtn?.removeEventListener('click', handleRecruit));
    }

    public update(_time: number, _delta: number): void {
        // Raycasting for Hover
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects([...this.provinceMarkers.values()]);

        if (intersects.length > 0) {
            const hit = intersects[0].object;
            const id = hit.userData.id;

            if (this.hoveredProvinceId !== id) {
                this.hoveredProvinceId = id;
                document.body.style.cursor = 'pointer';

                // Hover Animation
                gsap.to(hit.scale, { x: 1.2, y: 1.2, z: 1.2, duration: 0.2 });
            }
        } else {
            if (this.hoveredProvinceId) {
                const marker = this.provinceMarkers.get(this.hoveredProvinceId);
                if (marker) gsap.to(marker.scale, { x: 1, y: 1, z: 1, duration: 0.2 });

                this.hoveredProvinceId = null;
                document.body.style.cursor = 'default';
            }
        }

        // Smooth camera pan based on mouse edge? (Skipped for now for simplicity)
    }

    private updateSelectionUI(selectedId: string | null, provinces: Province[]) {
        const panel = this.ui.querySelector('#province-panel') as HTMLElement;
        if (!selectedId) {
            panel.classList.add('hidden');
            return;
        }

        const p = provinces.find(prov => prov.id === selectedId);
        if (p) {
            panel.classList.remove('hidden');
            (this.ui.querySelector('#prov-name') as HTMLElement).textContent = p.name;
            (this.ui.querySelector('#prov-owner') as HTMLElement).textContent = p.owner;
            (this.ui.querySelector('#prov-wealth') as HTMLElement).textContent = p.wealth.toString();
            (this.ui.querySelector('#prov-manpower') as HTMLElement).textContent = p.manpower.toString();
            (this.ui.querySelector('#prov-happiness') as HTMLElement).textContent = p.happiness.toString() + '%';
            (this.ui.querySelector('#prov-army') as HTMLElement).textContent = p.armySize.toString() + ' Legions';

            (this.ui.querySelector('#prov-owner') as HTMLElement).style.color = '#' + this.getFactionColor(p.owner).toString(16).padStart(6, '0');

            // Button Logic
            const attackBtn = this.ui.querySelector('#attack-btn') as HTMLElement;
            const recruitBtn = this.ui.querySelector('#recruit-btn') as HTMLElement;

            if (p.owner === 'ROME') {
                attackBtn.style.display = 'none';
                recruitBtn.style.display = 'inline-block';
            } else {
                attackBtn.style.display = 'inline-block';
                recruitBtn.style.display = 'none';
            }
        }
    }

    public render(renderer: THREE.WebGLRenderer): void {
        renderer.render(this.scene, this.camera);
    }

    public resize(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    public dispose(): void {
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('click', this.onClick);
        this.cleanupParams.forEach(fn => fn());
        // Dispose Three.js objects...
    }

    private checkWinCondition(provinces: Province[]) {
        const ownedByRome = provinces.filter(p => p.owner === 'ROME').length;
        const total = provinces.length;

        let title = '';
        let msg = '';
        let color = '';

        if (ownedByRome === total) {
            title = 'PAX ROMANA!';
            msg = 'You have conquered the known world. Rome is eternal.';
            color = 'gold';
        } else if (ownedByRome === 0) {
            title = 'ROME HAS FALLEN';
            msg = 'The barbarian hordes have overrun the Empire. All is lost.';
            color = 'red';
        }

        if (title) {
            // Show Overlay
            const overlay = document.createElement('div');
            overlay.style.position = 'absolute';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100vw';
            overlay.style.height = '100vh';
            overlay.style.background = 'rgba(0,0,0,0.9)';
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.color = 'white';
            overlay.style.zIndex = '1000';
            overlay.style.pointerEvents = 'auto';

            overlay.innerHTML = `
                <h1 style="font-size: 5em; color: ${color}; margin-bottom: 20px; text-shadow: 0 0 10px ${color};">${title}</h1>
                <p style="font-size: 2em; margin-bottom: 40px;">${msg}</p>
                <button id="restart-btn" class="roman-btn" style="font-size: 1.5em; padding: 20px 40px;">PLAY AGAIN</button>
            `;

            document.body.appendChild(overlay);

            // Pause Game (Hack: just cover screen and reload on click)
            const btn = overlay.querySelector('#restart-btn');
            btn?.addEventListener('click', () => {
                window.location.reload();
            });

            // Stop update loop effectively by switching manager to null or similar loop break
            this.manager = null;
        }
    }
}
