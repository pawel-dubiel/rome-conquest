import * as THREE from 'three';

export type Team = 'ROME' | 'ENEMY';
export type UnitState = 'IDLE' | 'MARCH' | 'FIGHT' | 'DEAD';

export class Cohort {
    public mesh: THREE.Group;
    public health: number = 100;
    public damage: number = 0.5; // Damage per frame
    public range: number = 1.5;
    public speed: number = 2.0;

    public state: UnitState = 'IDLE';
    public team: Team;
    public target: Cohort | null = null;

    private material: THREE.MeshStandardMaterial;

    constructor(team: Team, color: number) {
        this.team = team;
        this.mesh = new THREE.Group();

        // Stats Balance
        if (this.team === 'ROME') {
            this.health = 150; // Stronger armor
            this.damage = 1.0; // Discipline
        } else {
            this.health = 100;
            this.damage = 0.6;
        }

        // Visuals: A block of soldiers (represented by 3x2 small boxes)
        this.material = new THREE.MeshStandardMaterial({ color });
        const geo = new THREE.BoxGeometry(0.3, 0.8, 0.3);

        for (let x = 0; x < 3; x++) {
            for (let z = 0; z < 2; z++) {
                const soldier = new THREE.Mesh(geo, this.material);
                soldier.position.set((x - 1) * 0.5, 0.4, (z - 0.5) * 0.5);
                this.mesh.add(soldier);
            }
        }

        // Random slight offset to avoid z-fighting/perfect overlap looks
        this.mesh.position.set(0, 0, 0);
    }

    public setPosition(x: number, z: number) {
        this.mesh.position.set(x, 0, z);
    }

    public lookAt(target: THREE.Vector3) {
        this.mesh.lookAt(target.x, 0, target.z);
    }

    public update(delta: number, enemies: Cohort[]) {
        if (this.state === 'DEAD') return;

        if (this.health <= 0) {
            this.die();
            return;
        }

        // 1. Find Target if none
        if (!this.target || this.target.state === 'DEAD') {
            this.target = this.findNearestEnemy(enemies);
        }

        if (this.target) {
            const dist = this.mesh.position.distanceTo(this.target.mesh.position);

            if (dist <= this.range) {
                this.state = 'FIGHT';
                this.target.takeDamage(this.damage);

                // Fight wobble
                this.mesh.rotation.y += Math.sin(Date.now() * 0.01) * 0.1;

            } else {
                this.state = 'MARCH';
                this.lookAt(this.target.mesh.position);

                const dir = new THREE.Vector3()
                    .subVectors(this.target.mesh.position, this.mesh.position)
                    .normalize();

                this.mesh.position.add(dir.multiplyScalar(this.speed * delta));
            }
        } else {
            this.state = 'IDLE';
        }
    }

    public takeDamage(amount: number) {
        this.health -= amount;
        // Flash white logic could go here
    }

    private die() {
        this.state = 'DEAD';
        this.mesh.visible = false;
        // Or play death animation / fall over
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.y = 0.1;
        this.material.color.setHex(0x333333); // Darken
        this.mesh.visible = true; // Keep visible as corpse
    }

    private findNearestEnemy(enemies: Cohort[]): Cohort | null {
        let minDist = Infinity;
        let nearest: Cohort | null = null;

        for (const e of enemies) {
            if (e.state === 'DEAD') continue;
            const d = this.mesh.position.distanceToSquared(e.mesh.position);
            if (d < minDist) {
                minDist = d;
                nearest = e;
            }
        }
        return nearest;
    }
}
