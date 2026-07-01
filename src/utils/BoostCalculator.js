/**
 * Utility class for calculating RMU Boost Skill modifiers.
 */
export class BoostCalculator {
    /**
     * Calculates the primary and complementary bonuses for a Boost Skill check.
     * @param {Object} calcState - The current state object from the UI.
     * @param {Map} participants - The map of participant data.
     * @param {Array} allPrimarySkills - Array of all skills belonging to the primary actor.
     * @returns {Object} The calculated totals and breakdown.
     */
    static calculate(calcState, participants, allPrimarySkills) {
        const primaryActor = participants.get(calcState.primaryActorId);
        if (!primaryActor) return {};

        const primarySkill = allPrimarySkills.find((s) => s.uuid === calcState.primarySkillUuid);
        const primaryBonus = primarySkill?.bonus || 0;

        let complementRanks = [];

        // Gather primary actor's complementary skills
        for (const skill of calcState.primaryActorSkills) {
            if (skill.ranks > 0) {
                complementRanks.push({
                    name: game.i18n.format("RMU_CS.Boost.BreakdownNameFormat", { actorName: primaryActor.name, skillName: skill.name }),
                    ranks: skill.ranks,
                });
            }
        }

        // Gather other participants' complementary skills
        for (const [actorId, skillUuid] of Object.entries(calcState.otherActorSkills)) {
            const participant = participants.get(actorId);
            if (participant?.enabled && skillUuid) {
                const skillData = participant.allSkills.find((s) => s.uuid === skillUuid);
                if (skillData && skillData.ranks > 0) {
                    complementRanks.push({
                        name: game.i18n.format("RMU_CS.Boost.BreakdownNameFormat", { actorName: participant.name, skillName: skillData.name }),
                        ranks: skillData.ranks,
                    });
                }
            }
        }

        // Apply diminishing returns algorithm
        complementRanks.sort((a, b) => b.ranks - a.ranks);
        let complementBonus = 0;
        const breakdown = [];

        complementRanks.forEach((item, index) => {
            const bonus = index === 0 ? item.ranks : Math.floor(item.ranks / Math.pow(2, index));
            complementBonus += bonus;
            breakdown.push({ ...item, bonus: bonus });
        });

        return {
            primaryBonus: primaryBonus,
            complementBonus: complementBonus,
            total: primaryBonus + complementBonus,
            breakdown: breakdown,
        };
    }
}
