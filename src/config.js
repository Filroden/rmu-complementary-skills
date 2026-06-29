/**
 * Global configuration settings and constants for the RMU Complementary Skills module.
 */
export const VALID_ACTOR_TYPES = ["Character", "Creature"];

/**
 * Ritual Modifier Options (from RMU Spell Law Chapter 5)
 */
export const RITUAL_OPTIONS = {
    listType: [
        { value: 10, label: "RMU_CS.Ritual.TypeOwnBase" },
        { value: 0, label: "RMU_CS.Ritual.TypeOpen" },
        { value: -10, label: "RMU_CS.Ritual.TypeClosed" },
        { value: -20, label: "RMU_CS.Ritual.TypeEvilKnown" },
        { value: -40, label: "RMU_CS.Ritual.TypeOtherBase" },
        { value: -50, label: "RMU_CS.Ritual.TypeEvilUnknown" },
        { value: -50, label: "RMU_CS.Ritual.TypeOtherRealm" },
    ],
    listKnowledge: [
        { value: -50, label: "RMU_CS.Ritual.KnowledgeNone" },
        { value: -30, label: "RMU_CS.Ritual.KnowledgeBelow" },
        { value: 0, label: "RMU_CS.Ritual.KnowledgeFull" },
    ],
    investingTime: [
        { value: 0, label: "RMU_CS.Ritual.Time3Min" },
        { value: 5, label: "RMU_CS.Ritual.Time7Min" },
        { value: 10, label: "RMU_CS.Ritual.TimeHalfHour" },
        { value: 15, label: "RMU_CS.Ritual.Time1Hour" },
        { value: 20, label: "RMU_CS.Ritual.Time2Hours" },
        { value: 25, label: "RMU_CS.Ritual.Time4Hours" },
        { value: 30, label: "RMU_CS.Ritual.Time8Hours" },
        { value: 35, label: "RMU_CS.Ritual.Time16Hours" },
        { value: 40, label: "RMU_CS.Ritual.Time24Hours" },
        { value: 45, label: "RMU_CS.Ritual.Time3Days" },
        { value: 50, label: "RMU_CS.Ritual.Time7Days" },
        { value: 55, label: "RMU_CS.Ritual.Time9Days" },
        { value: 60, label: "RMU_CS.Ritual.Time1Month" },
        { value: 65, label: "RMU_CS.Ritual.Time3Months" },
        { value: 70, label: "RMU_CS.Ritual.Time1Year" },
    ],
    roles: [
        { value: "primary", label: "RMU_CS.Ritual.RolePrimary" },
        { value: "major", label: "RMU_CS.Ritual.RoleMajor" },
        { value: "minor", label: "RMU_CS.Ritual.RoleMinor" },
    ],
    bloodHits: [
        { value: 0, label: "RMU_CS.Boost.None" },
        { value: 1, label: "1d10" },
        { value: 2, label: "2d10" },
        { value: 4, label: "4d10" },
        { value: 8, label: "8d10" },
        { value: 16, label: "16d10" },
        { value: 32, label: "32d10" },
    ],
    bloodCrits: [
        { value: 0, label: "RMU_CS.Boost.None" },
        { value: 1, label: "A" },
        { value: 2, label: "B" },
        { value: 3, label: "C" },
        { value: 4, label: "D" },
        { value: 5, label: "E" },
    ],
    itemAppropriateness: [
        { value: -5, label: "RMU_CS.Ritual.AppropLess" },
        { value: 0, label: "RMU_CS.Ritual.AppropGeneral" },
        { value: 5, label: "RMU_CS.Ritual.AppropBroad" },
        { value: 10, label: "RMU_CS.Ritual.AppropSpecific" },
    ],
    hitMultipliers: [
        { value: 0, label: "RMU_CS.Boost.None" },
        { value: 1, label: "RMU_CS.Ritual.Hitx2" },
        { value: 2, label: "RMU_CS.Ritual.Hitx3" },
        { value: 3, label: "RMU_CS.Ritual.Hitx4" },
        { value: 4, label: "RMU_CS.Ritual.Hitx5" },
    ],
    durationSteps: [
        { value: 0, label: "RMU_CS.Ritual.DurRound" },
        { value: 1, label: "RMU_CS.Ritual.DurMinute" },
        { value: 2, label: "RMU_CS.Ritual.Dur10Min" },
        { value: 3, label: "RMU_CS.Ritual.Dur30Min" },
        { value: 4, label: "RMU_CS.Ritual.DurHour" },
        { value: 5, label: "RMU_CS.Ritual.DurDay" },
        { value: 6, label: "RMU_CS.Ritual.DurWeek" },
        { value: 7, label: "RMU_CS.Ritual.DurMonth" },
        { value: 8, label: "RMU_CS.Ritual.DurYear" },
        { value: 9, label: "RMU_CS.Ritual.DurDecade" },
        { value: 10, label: "RMU_CS.Ritual.DurCentury" },
        { value: 11, label: "RMU_CS.Ritual.DurMillennium" },
        { value: 12, label: "RMU_CS.Ritual.DurPermanent" },
    ],
    realmPenalties: {
        1: { value: 0, label: "RMU_CS.Ritual.PPSourceOneRealm" },
        2: { value: -10, label: "RMU_CS.Ritual.PPSourceTwoRealms" },
        3: { value: -25, label: "RMU_CS.Ritual.PPSourceThreeRealms" },
    },
};
