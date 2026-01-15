import { createStore } from 'zustand/vanilla';

export type Faction = 'ROME' | 'CARTHAGE' | 'BARBARIAN' | 'EGYPT';

export type TaxLevel = 'LOW' | 'NORMAL' | 'HIGH' | 'ABUSIVE';

export interface Province {
    id: string;
    name: string;
    owner: Faction;
    position: { x: number; z: number };
    wealth: number;
    manpower: number;
    happiness: number; // 0-100
    armySize: number; // Number of cohorts/legions
    neighbors: string[];
}

export interface BattleResult {
    won: boolean;
    provinceId: string;
    sourceProvinceId: string;
    survivingLegions: number; // For Winner: Troops moving in. For Loser: Troops returning.
    committedLegions: number; // Total legions that left the source
}

interface GameState {
    year: number;
    treasury: number;
    factionTreasuries: Record<Faction, number>;
    taxLevel: TaxLevel;
    provinces: Province[];
    selectedProvinceId: string | null;
    actions: {
        endTurn: () => void;
        selectProvince: (id: string | null) => void;
        setTaxLevel: (level: TaxLevel) => void;
        recruitLegion: (provinceId: string) => void;
        resolveBattle: (result: BattleResult) => void;
    };
}

// Initial Map Data (Simplified Europe)
const INITIAL_PROVINCES: Province[] = [
    { id: 'roma', name: 'Italia', owner: 'ROME', position: { x: 1, z: -4 }, wealth: 100, manpower: 50, happiness: 100, armySize: 2, neighbors: ['gallia', 'graecia', 'carthage', 'hispania'] },
    { id: 'gallia', name: 'Gallia', owner: 'BARBARIAN', position: { x: -5, z: -8 }, wealth: 40, manpower: 60, happiness: 50, armySize: 5, neighbors: ['roma', 'hispania'] },
    { id: 'hispania', name: 'Hispania', owner: 'BARBARIAN', position: { x: -12, z: -1 }, wealth: 50, manpower: 40, happiness: 50, armySize: 3, neighbors: ['gallia', 'roma', 'carthage'] },
    { id: 'carthage', name: 'Africa', owner: 'CARTHAGE', position: { x: -2, z: 5 }, wealth: 80, manpower: 40, happiness: 50, armySize: 6, neighbors: ['roma', 'hispania', 'aegyptus'] },
    { id: 'aegyptus', name: 'Aegyptus', owner: 'EGYPT', position: { x: 12, z: 9 }, wealth: 120, manpower: 30, happiness: 50, armySize: 4, neighbors: ['carthage', 'graecia'] },
    { id: 'graecia', name: 'Graecia', owner: 'BARBARIAN', position: { x: 8, z: -1 }, wealth: 60, manpower: 30, happiness: 50, armySize: 3, neighbors: ['roma', 'aegyptus'] },
];

const TAX_RATES: Record<TaxLevel, number> = {
    'LOW': 0.5,
    'NORMAL': 1.0,
    'HIGH': 1.5,
    'ABUSIVE': 2.0
};

const HAPPINESS_PENALTY: Record<TaxLevel, number> = {
    'LOW': -2,  // Gain happiness
    'NORMAL': 0,
    'HIGH': 5,
    'ABUSIVE': 15
};

export const gameStore = createStore<GameState>((set) => ({
    year: 270,
    treasury: 1000,
    factionTreasuries: { 'ROME': 0, 'CARTHAGE': 500, 'BARBARIAN': 200, 'EGYPT': 800 },
    taxLevel: 'NORMAL',
    provinces: INITIAL_PROVINCES,
    selectedProvinceId: null,
    actions: {
        endTurn: () =>
            set((state) => {
                const taxMultiplier = TAX_RATES[state.taxLevel];
                const happinessChange = -HAPPINESS_PENALTY[state.taxLevel];

                let income = 0;
                let newProvinces = state.provinces.map(p => {
                    if (p.owner === 'ROME') {
                        income += p.wealth * taxMultiplier;
                        return {
                            ...p,
                            happiness: Math.max(0, Math.min(100, p.happiness + happinessChange))
                        };
                    }
                    return p;
                });

                // Process AI Turns
                const aiResult = processAiTurn(newProvinces, state.factionTreasuries);
                newProvinces = aiResult.provinces;
                const newTreasuries = aiResult.treasuries;

                return {
                    year: state.year - 1,
                    treasury: state.treasury + Math.floor(income),
                    factionTreasuries: newTreasuries,
                    provinces: newProvinces
                };
            }),
        selectProvince: (id) => set({ selectedProvinceId: id }),
        setTaxLevel: (level) => set({ taxLevel: level }),
        recruitLegion: (provinceId) => set((state) => {
            const COST = 100;
            if (state.treasury < COST) return state;

            return {
                treasury: state.treasury - COST,
                provinces: state.provinces.map(p =>
                    p.id === provinceId ? { ...p, armySize: p.armySize + 1 } : p
                )
            };
        }),
        resolveBattle: (result) =>
            set((state) => {
                let newProvinces = [...state.provinces];

                // Deduct committed troops from source (they left to fight)
                newProvinces = newProvinces.map(p => {
                    if (p.id === result.sourceProvinceId) {
                        return { ...p, armySize: Math.max(0, p.armySize - result.committedLegions) };
                    }
                    return p;
                });

                if (result.won) {
                    // Win: Target becomes ROME with surviving troops
                    newProvinces = newProvinces.map(p => {
                        if (p.id === result.provinceId) {
                            return { ...p, owner: 'ROME', armySize: result.survivingLegions, happiness: 50 };
                        }
                        return p;
                    });
                } else {
                    // Loss: Surviving troops return to source
                    newProvinces = newProvinces.map(p => {
                        if (p.id === result.sourceProvinceId) {
                            return { ...p, armySize: p.armySize + result.survivingLegions };
                        }
                        return p;
                    });
                }
                return { provinces: newProvinces };
            }),
    },
}));

// AI Logic Helper
function processAiTurn(provinces: Province[], treasuries: Record<Faction, number>): { provinces: Province[], treasuries: Record<Faction, number> } {
    let nextProvinces = [...provinces];
    const nextTreasuries = { ...treasuries };
    const factions: Faction[] = ['CARTHAGE', 'BARBARIAN', 'EGYPT'];

    factions.forEach(faction => {
        // 1. Income
        let income = 0;
        const myProvinces = nextProvinces.filter(p => p.owner === faction);
        if (myProvinces.length === 0) return;

        myProvinces.forEach(p => {
            income += p.wealth * 1.0; // Normal tax assumed for AI
        });
        nextTreasuries[faction] += income;

        // 2. Recruitment (Defense & Buildup)
        myProvinces.forEach(p => {
            const cost = 100;
            if (nextTreasuries[faction] >= cost) {
                // Determine need: Army < 3 is critically low. Army < 8 is buildup.
                if (p.armySize < 3 || (p.armySize < 8 && Math.random() > 0.5)) {
                    nextTreasuries[faction] -= cost;
                    // Update P in nextProvinces
                    nextProvinces = nextProvinces.map(prov =>
                        prov.id === p.id ? { ...prov, armySize: prov.armySize + 1 } : prov
                    );
                    // Update local reference for next check
                    p.armySize += 1;
                }
            }
        });

        // 3. Conquest (Aggression)
        // Check finding active armies again since we recruited
        const readyArmies = nextProvinces.filter(p => p.owner === faction && p.armySize >= 4);

        readyArmies.forEach(attacker => {
            if (!attacker.neighbors) return;

            attacker.neighbors.forEach(neighborId => {
                const defender = nextProvinces.find(p => p.id === neighborId);
                if (!defender || defender.owner === faction) return;

                // Evaluate Attack
                // Power Calc: (Size * StatMultiplier)
                const getPower = (p: Province) => {
                    let mult = 1.0;
                    if (p.owner === 'ROME') mult = 1.5; // Rome strong
                    if (p.owner === 'BARBARIAN') mult = 0.8;
                    return p.armySize * mult;
                };

                const myPower = getPower(attacker);
                const enemyPower = getPower(defender);

                // Aggression Threshold: 1.5x Advantage
                if (myPower > enemyPower * 1.5) {
                    console.log(`AI ATTACK: ${faction} attacks ${defender.name} from ${attacker.name}!`);

                    // Resolve Battle (Instant)
                    // Simplified: Winner takes all. Loser wiped out.
                    // Casualties: Attacker loses 20% + (EnemyPower/MyPower * 20%) ??
                    // Let's simplified: Attacker loses 1/3 of force to win.

                    const survivors = Math.max(1, Math.floor(attacker.armySize * 0.7));

                    // Update World
                    nextProvinces = nextProvinces.map(worldProv => {
                        // Defender becomes occupied
                        if (worldProv.id === defender.id) {
                            return { ...worldProv, owner: faction, armySize: survivors, happiness: 50 };
                        }
                        // Attacker troops move out (leave 1 behind garrison)
                        if (worldProv.id === attacker.id) {
                            return { ...worldProv, armySize: 1 };
                        }
                        return worldProv;
                    });

                    // Stop checking other neighbors for this province (it attacked)
                    attacker.armySize = 1;
                }
            });
        });
    });

    return { provinces: nextProvinces, treasuries: nextTreasuries };
}
