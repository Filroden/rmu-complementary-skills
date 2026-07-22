/**
 * Utility class for calculating RMU Group Task modifiers.
 */
export class GroupCalculator {
    /**
     * Calculates the average skill bonus and leadership modifier for a Group Task.
     * @param {Object} calcState - The current state object from the UI.
     * @param {Map} participants - The map of participant data.
     * @returns {Object} The calculated totals and participant breakdown.
     */
    static calculate(calcState, participants) {
        const enabledParticipants = participants.filter((p) => p.enabled);
        if (enabledParticipants.length === 0) return {};

        let totalBonus = 0;
        const participantBonuses = [];

        for (const p of enabledParticipants) {
            const bonus = p.bonusForSelectedSkill || 0;
            totalBonus += bonus;
            participantBonuses.push({ name: p.name, bonus: bonus });
        }

        const averageBonus = enabledParticipants.length > 0 ? totalBonus / enabledParticipants.length : 0;
        const leader = participants.find((p) => p.id === calcState.leaderId);
        const leadershipBonus = leader?.enabled ? leader.leadershipRanks : 0;

        return {
            taskSkillName: calcState.taskSkillName,
            participants: participantBonuses,
            averageBonus: Math.round(averageBonus),
            leadershipBonus: leadershipBonus,
            leaderName: leader?.name || game.i18n.localize("RMU_CS.Group.LeaderNone"),
            total: Math.round(averageBonus) + leadershipBonus,
        };
    }
}
