import * as THREE from 'three';

import type { IScene, SceneManager } from '../core/SceneManager';
import { StrategyScene } from './StrategyScene';
import { gameStore } from '../state/gameState';
import { Cohort } from '../entities/Cohort';
import type { Team } from '../entities/Cohort';

// Removed unused imports and variable placeholders

export type Formation =
    'BALANCED' | 'WEDGE' | 'STRONG_RIGHT' | 'STRONG_LEFT' |
    'FRONTAL_ASSAULT' | 'SCIPIO_DEFENSE' | 'OUTFLANK' | 'STAND_FAST';

export class BattleScene implements IScene {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private manager: SceneManager | null = null;
    public ui: HTMLElement;

    private units: Cohort[] = [];
    private targetProvinceId: string | null = null;
    private sourceProvinceId: string | null = null;
    private committedLegions: number = 0;
    private battleOver: boolean = false;
    // private battleState eliminated - always fighting once loaded
    // private playerFormation eliminated - random now

    constructor(targetProvinceId?: string, sourceProvinceId?: string, committedLegions: number = 3) {
        this.targetProvinceId = targetProvinceId || null;
        this.sourceProvinceId = sourceProvinceId || null;
        this.committedLegions = committedLegions;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue

        // Simple ground
        const groundGeo = new THREE.PlaneGeometry(50, 50);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x4caf50 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        this.scene.add(ground);

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.position.set(10, 20, 10);
        this.scene.add(sun);

        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        this.camera.position.set(0, 20, 30);
        this.camera.lookAt(0, 0, 0);

        // UI
        this.ui = document.createElement('div');
        this.ui.className = 'ui-layer';
        this.ui.style.pointerEvents = 'none';
        this.ui.innerHTML = `
      <div style="background: rgba(0,0,0,0.5); padding: 10px; color: white; text-align: center; pointer-events: auto;">
        <h2>BATTLE STARTED</h2>
        <div id="battle-status">Fighting...</div>
        <div style="display: flex; gap: 10px; justify-content: center; margin-top: 10px;">
            <button id="retreat-btn" class="roman-btn">Retreat</button>
        </div>
      </div>
    `;

        // Initial Setup
        this.setupArmies();
    }

    private setupArmies() {
        // Player (Attacker) - Use committed count from constructor
        const playerLegions = this.committedLegions;

        // Enemy (Defender)
        let enemyLegions = 2; // Default
        if (this.targetProvinceId) {
            const prov = gameStore.getState().provinces.find(p => p.id === this.targetProvinceId);
            if (prov) enemyLegions = prov.armySize;
        }

        const playerCohorts = playerLegions * 6;
        const enemyCohorts = enemyLegions * 6;

        const enemies = this.spawnCohorts(enemyCohorts, 'ENEMY', 0x0000ff);
        const romans = this.spawnCohorts(playerCohorts, 'ROME', 0xcc0000);

        // Random Formations for BOTH sides
        const formations: Formation[] = ['BALANCED', 'WEDGE', 'STRONG_RIGHT', 'SCIPIO_DEFENSE', 'FRONTAL_ASSAULT', 'OUTFLANK'];

        const playerFormation = formations[Math.floor(Math.random() * formations.length)];
        const enemyFormation = formations[Math.floor(Math.random() * formations.length)];

        console.log(`Battle Tactics: Player [${playerFormation}] vs Enemy [${enemyFormation}]`);

        this.applyFormation(romans, -10, playerFormation, 'ROME');
        this.applyFormation(enemies, 10, enemyFormation, 'ENEMY');

        // Face each other
        romans.forEach(u => u.lookAt(new THREE.Vector3(10, 0, 0)));
        enemies.forEach(u => u.lookAt(new THREE.Vector3(-10, 0, 0)));
    }

    private spawnCohorts(count: number, team: Team, color: number): Cohort[] {
        const units: Cohort[] = [];
        for (let i = 0; i < count; i++) {
            const u = new Cohort(team, color);
            this.scene.add(u.mesh);
            this.units.push(u);
            units.push(u);
        }
        return units;
    }

    private applyFormation(units: Cohort[], centerX: number, type: Formation, team: Team) {
        const spacing = 1.5;
        // NOTE: Actually, if Rome is at x=-5, they face +X. Enemy at x=5 faces -X.
        // My previous logic was: Rome at -10, Enemy at 10.
        // Rome grows backwards (more negative)? No, should grow in depth away from center.
        // If Rome is at -10 and facing 0, backward is -12, -14. Forward is -8.
        // Let's assume centerX is the "Front Line".
        const depthDir = team === 'ROME' ? -1 : 1;

        // Helper to place unit at (row, col) centered on z-axis
        const place = (u: Cohort, row: number, col: number, rowWidthStr: number) => {
            const z = (col * spacing) - ((rowWidthStr * spacing) / 2) + (spacing / 2);
            const x = centerX + (depthDir * row * spacing);
            u.setPosition(x, z);
        };

        if (type === 'BALANCED' || type === 'FRONTAL_ASSAULT' || type === 'STAND_FAST') {
            // Standard Box. Frontal is denser (less spacing? logic same for now)
            const cols = type === 'FRONTAL_ASSAULT' ? 15 : 10;
            units.forEach((u, i) => {
                const row = Math.floor(i / cols);
                const col = i % cols;
                // Center the row
                const itemsInRow = Math.min(units.length - row * cols, cols);
                place(u, row, col, itemsInRow);
            });

        } else if (type === 'WEDGE') {
            // Triangle
            let index = 0;
            let row = 0;
            while (index < units.length) {
                const unitsInRow = row + 1; // 1, 2, 3...
                for (let i = 0; i < unitsInRow && index < units.length; i++) {
                    place(units[index], row, i, unitsInRow);
                    index++;
                }
                row++;
            }

        } else if (type === 'SCIPIO_DEFENSE') {
            // Triplex Acies (Checkerboard)
            // 3 Lines with gaps suited for retreating Velites (not implemented, but gaps remain)
            // Row 0: Full? No, gaps. X X X
            // Row 1: Filling gaps.   X X
            // Let's simplify: Row 0 has even slots filled, Row 1 has odd slots filled.
            const cols = 8;
            units.forEach((u, i) => {
                const row = Math.floor(i / cols); // 0, 1, 2
                const col = i % cols;

                // Add gap offset
                // spacing * 2 for gaps?
                const realZ = (col * spacing * 2) - (cols * spacing) + (row % 2 === 0 ? 0 : spacing);
                const realX = centerX + (depthDir * row * spacing * 2); // Deeper lines
                u.setPosition(realX, realZ);
            });

        } else if (type === 'STRONG_RIGHT') {
            // Heavy Right Flank (Positive Z is "Down/Right" if looking from -X? No, X is forward/back, Z is left/right)
            // If facing +X, Right is +Z.
            // Put more units in high col numbers (Right side).
            // Stack them deep on the right.
            const heavySideCols = 4; // Rows here are deep
            const weakSideCols = 10; // Rows here are thin
            // Allocate 70% to Right.
            const split = Math.floor(units.length * 0.7);
            const rightWing = units.slice(0, split);
            const leftWing = units.slice(split);

            // Deploy Right Wing (Deep column on Right)
            rightWing.forEach((u, i) => {
                const r = Math.floor(i / heavySideCols);
                const c = i % heavySideCols;
                // Place at Z > 5
                const x = centerX + (depthDir * r * spacing);
                const z = 5 + (c * spacing);
                u.setPosition(x, z);
            });

            // Deploy Left Wing (Thin line on Left)
            leftWing.forEach((u, i) => {
                const r = Math.floor(i / weakSideCols);
                const c = i % weakSideCols;
                // Place at Z < 5
                const x = centerX + (depthDir * r * spacing); // Refuse? (Start further back?)
                // Refused flank starts back:
                const refusedOffset = 3 * spacing;
                u.setPosition(x - (depthDir * refusedOffset), -10 + (c * spacing));
            });

        } else if (type === 'STRONG_LEFT') {
            // Mirror of Right
            const split = Math.floor(units.length * 0.7);
            const leftWing = units.slice(0, split);
            const rightWing = units.slice(split);

            // Deploy Left Wing (Deep on Left / neg Z)
            const cols = 4;
            leftWing.forEach((u, i) => {
                const r = Math.floor(i / cols);
                const c = i % cols;
                const x = centerX + (depthDir * r * spacing);
                const z = -10 + (c * spacing);
                u.setPosition(x, z);
            });
            // Weak Right
            rightWing.forEach((u, i) => {
                const r = Math.floor(i / 10);
                const c = i % 10;
                const refusedOffset = 3 * spacing;
                const x = centerX + (depthDir * r * spacing) - (depthDir * refusedOffset);
                const z = 0 + (c * spacing);
                u.setPosition(x, z);
            });

        } else if (type === 'OUTFLANK') {
            // Split into two wings, empty center
            const half = Math.floor(units.length / 2);
            units.forEach((u, i) => {
                const isLeft = i < half;
                const idx = isLeft ? i : i - half;
                const cols = 5;
                const r = Math.floor(idx / cols);
                const c = idx % cols;

                const zOffset = isLeft ? -15 : 5;
                const x = centerX + (depthDir * r * spacing);
                const z = zOffset + (c * spacing); // Wide spacing?
                u.setPosition(x, z);
            });
        }
    }

    public async init(manager: SceneManager): Promise<void> {
        this.manager = manager;
        console.log('BattleScene initialized');

        // Note: Cleaned up redundant button listeners that were here before
        // Logic moved to DOM creation in second block below.

        if (this.manager) {
            // Simple Battle HUD only (No Menu)
            const hud = document.createElement('div');
            hud.id = 'battle-hud';
            // hud.className = 'hidden'; // Visible immediately
            hud.innerHTML = `
                <div id="battle-status" style="font-size: 1.5em; font-weight: bold; text-shadow: 2px 2px 2px black;">Fighting...</div>
                <div style="margin-top: 10px;">
                    <button id="retreat-btn" class="roman-btn">Retreat</button>
                </div>
            `;

            const container = this.ui.querySelector('div'); // Existing "BATTLE STARTED" container
            if (container) {
                container.innerHTML = '';
                container.appendChild(hud);

                setTimeout(() => {
                    const btnRet = hud.querySelector('#retreat-btn');
                    btnRet?.addEventListener('click', () => {
                        if (this.manager) this.manager.switchScene(new StrategyScene());
                    });
                }, 0);
            }
        }
    }

    public update(_time: number, delta: number): void {
        if (this.battleOver) return;

        // Separate teams
        const activeUnits = this.units.filter(u => u.state !== 'DEAD');
        const romans = activeUnits.filter(u => u.team === 'ROME');
        const enemies = activeUnits.filter(u => u.team === 'ENEMY');

        // Win Check
        if (romans.length === 0) {
            this.endBattle(false);
            return;
        }
        if (enemies.length === 0) {
            this.endBattle(true);
            return;
        }

        // Update Units
        const enemiesRef = [...enemies]; // Copy for safety
        const romansRef = [...romans];

        romans.forEach(u => u.update(delta, enemiesRef));
        enemies.forEach(u => u.update(delta, romansRef));
    }

    private endBattle(victory: boolean) {
        this.battleOver = true;
        const status = this.ui.querySelector('#battle-status');
        if (status) {
            status.textContent = victory ? "VICTORY! Province Conquered." : "DEFEAT! Retreating...";
            status.setAttribute('style', `font-size: 2em; color: ${victory ? 'gold' : 'red'}; font-weight: bold;`);
        }

        // Calculate survivors (approximate based on remaining cohorts)
        // 6 Cohorts = 1 Legion.
        const survivors = this.units.filter(u => u.team === 'ROME' && u.state !== 'DEAD').length;
        const survivingLegions = Math.max(1, Math.floor(survivors / 6));
        // Logic: if you have ANY survivors, you get at least 1 legion back (or keep 1).

        if (this.targetProvinceId && this.sourceProvinceId) {
            gameStore.getState().actions.resolveBattle({
                won: victory,
                provinceId: this.targetProvinceId,
                sourceProvinceId: this.sourceProvinceId,
                survivingLegions: victory ? survivingLegions : Math.floor(this.committedLegions / 2),
                committedLegions: this.committedLegions
            });
        }

        // Auto-leave after 3s
        setTimeout(() => {
            if (this.manager) this.manager.switchScene(new StrategyScene());
        }, 3000);
    }

    public render(renderer: THREE.WebGLRenderer): void {
        renderer.render(this.scene, this.camera);
    }

    public resize(width: number, height: number): void {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    public dispose(): void {
        // cleanup
    }
}
