import { RITUAL_OPTIONS } from "../config.js";

/**
 * Utility class for calculating RMU Magical Ritual modifiers.
 * Strictly separates mathematical logic from UI state management.
 */
export class RitualCalculator {
    /**
     * Master function to aggregate all ritual modifiers.
     * @param {Object} ritualState - The current state object from the UI.
     * @param {Array} participants - The array of enabled participants.
     * @returns {{total: number, breakdown: Array<{label: string, bonus: number}>, totalPP: number, totalHitDice: number, totalCritSeverities: number}}
     */
    static calculateTotalRitualBonus(ritualState, participants) {
        const result = {
            total: 0,
            primaryBonus: 0,
            primarySkillLabel: "",
            modifiersTotal: 0,
            breakdown: [],
            totalPP: 0,
            totalHitDice: 0,
            totalCritSeverities: 0,
        };

        this.#processTargetSpells(ritualState, result);
        this.#processRelativeLevel(ritualState, participants, result);
        this.#processCircumstances(ritualState, result);
        this.#processSpellParameters(ritualState, result);
        this.#processRitualItems(ritualState, result);

        this.#processParticipants(participants, result);
        this.#processPPSources(participants, result);
        this.#processInvestingPower(ritualState, result);
        this.#processBloodSacrifice(result);

        this.#processSkills(participants, result);

        return result;
    }

    /**
     * Helper to safely push a calculated bonus into the results object.
     * @param {string} label - The localised display string.
     * @param {number} bonus - The numerical modifier.
     * @param {Object} result - The mutable result object.
     * @param {boolean} [forceDisplay=false] - If true, bypasses the zero-value filter.
     */
    static #addBreakdown(label, bonus, result, forceDisplay = false) {
        if (bonus === 0 && !forceDisplay) return;
        result.modifiersTotal += bonus;
        result.total += bonus;
        result.breakdown.push({ label, bonus });
    }

    /**
     * Calculates penalties for combining multiple spells and their list types/knowledge.
     */
    static #processTargetSpells(ritualState, result) {
        const spells = ritualState.targetSpells;
        if (!spells || spells.length === 0) return;

        const MULTIPLE_SPELL_PENALTY = -25;
        const multipleSpellModifier = (spells.length - 1) * MULTIPLE_SPELL_PENALTY;
        this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.MultipleSpells"), multipleSpellModifier, result);

        spells.forEach((spell, index) => {
            const spellLabel = `${game.i18n.localize("RMU_CS.Common.Spell")} ${index + 1}`;

            if (spell.listType !== 0) {
                this.#addBreakdown(`${spellLabel} (${game.i18n.localize("RMU_CS.Ritual.ListType")})`, spell.listType, result);
            }
            if (spell.listKnowledge !== 0) {
                this.#addBreakdown(`${spellLabel} (${game.i18n.localize("RMU_CS.Ritual.ListKnowledge")})`, spell.listKnowledge, result);
            }
        });
    }

    /**
     * Compares the total spell level against the primary caster's level.
     */
    static #processRelativeLevel(ritualState, participants, result) {
        const primaryParticipant = participants.find((p) => p.ritualData?.role === "primary");
        if (!primaryParticipant?.attributes) return;

        const levelDifference = primaryParticipant.attributes.level - ritualState.totalSpellLevel;
        if (levelDifference === 0) return;

        const RELATIVE_LEVEL_BONUS = 1;
        const RELATIVE_LEVEL_PENALTY = 5;

        const modifier = levelDifference > 0 ? levelDifference * RELATIVE_LEVEL_BONUS : levelDifference * RELATIVE_LEVEL_PENALTY;

        this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.RelativeLevel"), modifier, result);
    }

    /**
     * Processes time investments and GM-arbitrated omens/circumstances.
     */
    static #processCircumstances(ritualState, result) {
        this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.TimeSpent"), ritualState.investingTime, result);

        const ausTotal = ritualState.auspiciousTime + ritualState.auspiciousLocation + ritualState.auspiciousProphecy;
        this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.AuspiciousCircumstances"), ausTotal, result);

        const inausTotal = ritualState.inauspiciousTime + ritualState.inauspiciousLocation + ritualState.inauspiciousProphecy;
        this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.InauspiciousCircumstances"), inausTotal, result);
    }

    /**
     * Aggregates spatial, impact, and temporal spell parameter extensions.
     */
    static #processSpellParameters(ritualState, result) {
        let paramTotal = 0;

        const WEIGHT_PENALTY = -10;
        const AOE_PENALTY = -20;
        const RANGE_PENALTY = -15;
        const DECREASE_AOE_PENALTY = -10;
        const CRIT_PENALTY = -30;
        const HIT_MULT_PENALTY = -10;
        const DUR_NO_TO_ROUND_PENALTY = -50;
        const DUR_CONC_TO_RND_LVL_PENALTY = -20;
        const DUR_REMOVE_CONC_PENALTY = -25;
        const DUR_STEP_PENALTY = -20;

        paramTotal += ritualState.paramWeight * WEIGHT_PENALTY;
        paramTotal += ritualState.paramAoE * AOE_PENALTY;
        paramTotal += ritualState.paramRange * RANGE_PENALTY;
        if (ritualState.paramDecreaseAoE) paramTotal += DECREASE_AOE_PENALTY;

        paramTotal += ritualState.paramCrit * CRIT_PENALTY;
        if (ritualState.paramHitMult > 0) paramTotal += ritualState.paramHitMult * HIT_MULT_PENALTY;

        if (ritualState.paramDurNoToRound) paramTotal += DUR_NO_TO_ROUND_PENALTY;
        if (ritualState.paramDurConcToRndLvl) paramTotal += DUR_CONC_TO_RND_LVL_PENALTY;
        if (ritualState.paramDurRemoveConc) paramTotal += DUR_REMOVE_CONC_PENALTY;

        const durationDifference = ritualState.paramDurTarget - ritualState.paramDurBase;
        if (durationDifference > 0) {
            paramTotal += durationDifference * DUR_STEP_PENALTY;
        }

        this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.ParameterExtensions"), paramTotal, result);
    }

    /**
     * Calculates bonuses from expended gold/silver components and their appropriateness.
     * Scales logarithmically: +5 bonus per factor of 10.
     */
    static #processRitualItems(ritualState, result) {
        const VALUE_MULTIPLIER = 5;

        // Process Tools (gp) - Bonus begins at 10 gp
        if (ritualState.toolValue >= 10) {
            const toolSteps = Math.floor(Math.log10(ritualState.toolValue));
            const toolBonus = toolSteps * VALUE_MULTIPLIER;
            this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.ToolValueBonus"), toolBonus, result);
        }

        // Process Sacrifices (sp) - Bonus begins at 1 sp
        if (ritualState.sacrificeValue >= 1) {
            const sacrificeSteps = Math.floor(Math.log10(ritualState.sacrificeValue)) + 1;
            const sacrificeBonus = sacrificeSteps * VALUE_MULTIPLIER;
            this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.SacrificeValueBonus"), sacrificeBonus, result);
        }

        // Process Appropriateness Modifiers
        if (ritualState.toolAppropriateness !== 0) {
            this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.ToolAppropriateness"), ritualState.toolAppropriateness, result);
        }

        if (ritualState.sacrificeAppropriateness !== 0) {
            this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.SacrificeAppropriateness"), ritualState.sacrificeAppropriateness, result);
        }
    }

    /**
     * Aggregates raw costs and sacrifices across all participants.
     */
    static #processParticipants(participants, result) {
        for (const p of participants) {
            if (!p.ritualData) continue;
            result.totalPP += p.ritualData.ppContributed || 0;
            result.totalHitDice += p.ritualData.bloodDice || 0;
            result.totalCritSeverities += p.ritualData.bloodCrit || 0;
        }
    }

    /**
     * Applies penalties based on the number of unique realms contributing PP.
     */
    static #processPPSources(participants, result) {
        const contributors = participants.filter((p) => p.ritualData?.ppContributed > 0);

        // If no one is actively spending PP yet, exit early
        if (contributors.length === 0) return;

        const uniqueRealms = new Set();

        for (const p of contributors) {
            const realms = p.attributes?.realms || [];

            // Fallback for actors without a realm defined to prevent mathematical errors
            if (realms.length === 0) {
                uniqueRealms.add("none");
            } else {
                realms.forEach((r) => uniqueRealms.add(r.toLowerCase()));
            }
        }

        const realmCount = uniqueRealms.size;

        if (realmCount <= 1) {
            const penalty = RITUAL_OPTIONS.realmPenalties[1];
            // Pass 'true' to force the zero-value modifier to render
            this.#addBreakdown(game.i18n.localize(penalty.label), penalty.value, result, true);
        } else if (realmCount === 2) {
            const penalty = RITUAL_OPTIONS.realmPenalties[2];
            this.#addBreakdown(game.i18n.localize(penalty.label), penalty.value, result);
        } else if (realmCount >= 3) {
            const penalty = RITUAL_OPTIONS.realmPenalties[3];
            this.#addBreakdown(game.i18n.localize(penalty.label), penalty.value, result);
        }
    }

    /**
     * Calculates the bonus for investing extra Power Points.
     * Scaling threshold: +n^3 PP over the minimum grants a +3*n bonus.
     */
    static #processInvestingPower(ritualState, result) {
        const basePPRequired = ritualState.totalSpellLevel;
        const extraPP = result.totalPP - basePPRequired;

        if (extraPP <= 0) return;

        // Extract the cube root and floor it to get the discrete 'n' step
        const n = Math.floor(Math.cbrt(extraPP));

        if (n < 1) return;

        const POWER_MULTIPLIER = 3;
        const bonus = n * POWER_MULTIPLIER;

        this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.InvestingPower"), bonus, result);
    }

    /**
     * Calculates the bonus modifiers for blood sacrifices (hits and criticals).
     * Hit dice scale on a doubling progression (log2) up to 32d10.
     * Crits scale linearly (+20 per degree) up to degree 5 (E).
     */
    static #processBloodSacrifice(result) {
        const HITS_MULTIPLIER = 5;
        const CRITS_MULTIPLIER = 20;

        // Strict system limits for blood investment
        const MAX_HITS = 32;
        const MAX_CRITS = 5;

        // Process Hit Dice (1d10 = +5, 2d10 = +10, 4d10 = +15, etc.)
        if (result.totalHitDice > 0) {
            const cappedHits = Math.min(result.totalHitDice, MAX_HITS);

            // Math.log2 converts the doubling progression into linear steps.
            // Math.floor ensures intermediate sums (e.g., 3d10) round down to the nearest valid threshold (2d10).
            const effectiveSteps = Math.floor(Math.log2(cappedHits)) + 1;
            const hitBonus = effectiveSteps * HITS_MULTIPLIER;

            this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.BloodHitsBonus"), hitBonus, result);
        }

        // Process Critical Severities (A = +20, B = +40, etc.)
        if (result.totalCritSeverities > 0) {
            const cappedCrits = Math.min(result.totalCritSeverities, MAX_CRITS);
            const critBonus = cappedCrits * CRITS_MULTIPLIER;

            this.#addBreakdown(game.i18n.localize("RMU_CS.Ritual.BloodCritBonus"), critBonus, result);
        }
    }

    /**
     * Extracts the Primary Caster's base skill bonus and applies diminishing returns
     * algorithms to the complementary Ritual and Additional skills.
     */
    static #processSkills(participants, result) {
        const primary = participants.find((p) => p.ritualData?.role === "primary");
        if (!primary) return;

        // 1. Primary Caster's Base Ritual Skill Bonus (Isolated from Modifiers)
        if (primary.ritualData.ritualSkillUuid) {
            const primaryRitualSkill = primary.allSkills.find((s) => s.uuid === primary.ritualData.ritualSkillUuid);
            if (primaryRitualSkill) {
                result.primarySkillLabel = game.i18n.format("RMU_CS.Ritual.PrimarySkillBonus", { name: primary.name, skill: primaryRitualSkill.name });
                result.primaryBonus = primaryRitualSkill.bonus;
                result.total += primaryRitualSkill.bonus;
            }
        }

        // 2. Complementary Ritual Skills (Major Contributors only)
        const ritualRanks = [];
        for (const p of participants) {
            // The Primary caster already contributed their full bonus; they do not contribute complementary ranks here.
            if (p.id === primary.id || p.ritualData?.role !== "major" || !p.ritualData.ritualSkillUuid) continue;

            const skill = p.allSkills.find((s) => s.uuid === p.ritualData.ritualSkillUuid);
            if (skill && skill.ranks > 0) {
                ritualRanks.push(skill.ranks);
            }
        }
        this.#applyDiminishingReturns(ritualRanks, "RMU_CS.Ritual.CompRitualSkill", result);

        // 3. Additional Complementary Skills (Primary and Major Contributors)
        const additionalRanks = [];
        for (const p of participants) {
            if (p.ritualData?.role === "minor" || !p.ritualData.additionalSkillUuid) continue;

            const skill = p.allSkills.find((s) => s.uuid === p.ritualData.additionalSkillUuid);
            if (skill && skill.ranks > 0) {
                additionalRanks.push(skill.ranks);
            }
        }
        this.#applyDiminishingReturns(additionalRanks, "RMU_CS.Ritual.CompAdditionalSkill", result);
    }

    /**
     * Sorts ranks descending and applies the base-2 diminishing returns logic.
     * @param {Array<number>} rankArray - Array of raw rank integers.
     * @param {string} localeKey - The localisation key for the breakdown label.
     * @param {Object} result - The mutable result object.
     */
    static #applyDiminishingReturns(rankArray, localeKey, result) {
        if (rankArray.length === 0) return;

        rankArray.sort((a, b) => b - a);
        let totalBonus = 0;

        rankArray.forEach((ranks, index) => {
            const bonus = index === 0 ? ranks : Math.floor(ranks / Math.pow(2, index));
            totalBonus += bonus;
        });

        if (totalBonus > 0) {
            this.#addBreakdown(game.i18n.localize(localeKey), totalBonus, result);
        }
    }
}
