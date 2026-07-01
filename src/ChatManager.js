import { RMUSkillParser } from "./RMUTokenParser.js";
import { BoostCalculator } from "./utils/BoostCalculator.js";
import { GroupCalculator } from "./utils/GroupCalculator.js";
import { RitualCalculator } from "./utils/RitualCalculator.js";

/**
 * Manages the generation and dispatch of chat messages for complementary skills.
 * Consolidates all Foundry VTT ChatMessage API interactions.
 */
export class ChatManager {
    /**
     * Dispatches the result of a Boost Skill calculation to the chat.
     * @param {Object} calcState - The current state object from the UI.
     * @param {Map} participants - The map of participant data.
     * @returns {Promise<boolean>} True if the message was sent successfully.
     */
    static async sendBoostToChat(calcState, participants) {
        const primaryActor = participants.get(calcState.primaryActorId);
        if (!primaryActor || !calcState.primarySkillUuid) {
            ui.notifications.warn(game.i18n.localize("RMU_CS.Notifications.SelectPrimary"));
            return false;
        }

        const allPrimarySkills = RMUSkillParser._getAllActorSkills(primaryActor.actor)
            .map(RMUSkillParser.getSkillData)
            .filter((sk) => !sk.disabledBySystem);

        const calc = BoostCalculator.calculate(calcState, participants, allPrimarySkills);
        const content = await foundry.applications.handlebars.renderTemplate("modules/rmu-complementary-skills/templates/chat-boost-skill.hbs", {
            primaryActorName: primaryActor.name,
            primarySkillName: calcState.primarySkillName,
            primaryBonus: calc.primaryBonus,
            breakdown: calc.breakdown,
            complementBonus: calc.complementBonus,
            total: calc.total,
        });

        await ChatMessage.create({
            user: game.user.id,
            content: content,
            whisper: this.#getRecipients(participants),
            flags: {
                "rmu-complementary-skills": {
                    isCalc: true,
                    rollType: "boost",
                    actorId: primaryActor.actor.id,
                    skillUuid: calcState.primarySkillUuid,
                    bonus: calc.complementBonus,
                },
            },
        });

        return true;
    }

    /**
     * Dispatches the result of a Group Task calculation to the chat.
     * @param {Object} calcState - The current state object from the UI.
     * @param {Map} participants - The map of participant data.
     * @returns {Promise<boolean>} True if the message was sent successfully.
     */
    static async sendGroupToChat(calcState, participants) {
        const leader = participants.get(calcState.leaderId);
        if (!leader || !calcState.taskSkillName) {
            ui.notifications.warn(game.i18n.localize("RMU_CS.Notifications.SelectTask"));
            return false;
        }

        const calc = GroupCalculator.calculate(calcState, participants);
        const leaderRaw = RMUSkillParser.getBestSkillMatch(leader.actor, calcState.taskSkillName);
        const leaderData = leaderRaw ? RMUSkillParser.getSkillData(leaderRaw) : null;
        const leaderSkillUuid = leaderData ? leaderData.uuid : calcState.taskSkillUuid;

        const content = await foundry.applications.handlebars.renderTemplate("modules/rmu-complementary-skills/templates/chat-group-task.hbs", calc);

        await ChatMessage.create({
            user: game.user.id,
            content: content,
            whisper: this.#getRecipients(participants),
            flags: {
                "rmu-complementary-skills": {
                    isCalc: true,
                    rollType: "group",
                    actorId: leader.actor.id,
                    skillUuid: leaderSkillUuid,
                    bonus: calc.total,
                },
            },
        });

        return true;
    }

    /**
     * Dispatches the result of a Magical Ritual calculation to the chat.
     * @param {Object} calcState - The current state object from the UI.
     * @param {Map} participants - The map of participant data.
     * @returns {Promise<boolean>} True if the message was sent successfully.
     */
    static async sendRitualToChat(calcState, participants) {
        // Hydrate the participants array with their ritual state so the Calculator can read it
        const ritualParticipants = Array.from(participants.values()).map((p) => ({
            ...p,
            ritualData: calcState.ritualParticipantData[p.id],
        }));

        const enabledParticipants = ritualParticipants.filter((p) => p.enabled);

        // Isolate the primary participant
        const primaryParticipant = enabledParticipants.find((p) => p.ritualData?.role === "primary");

        if (!primaryParticipant?.ritualData.ritualSkillUuid) {
            ui.notifications.warn(game.i18n.localize("RMU_CS.Notifications.SelectPrimaryRitual"));
            return false;
        }

        // Compute fresh calculation logic using the hydrated participants
        const calc = RitualCalculator.calculateTotalRitualBonus(calcState.ritualState, enabledParticipants);

        // Validation: Prevent dispatch if PP threshold is not met
        if (calc.totalPP < calcState.ritualState.totalSpellLevel) {
            ui.notifications.warn(game.i18n.localize("RMU_CS.Notifications.InsufficientPP"));
            return false;
        }

        const skillUuid = primaryParticipant.ritualData.ritualSkillUuid;
        const primarySkill = primaryParticipant.allSkills.find((s) => s.uuid === skillUuid);
        const skillName = primarySkill ? primarySkill.name : game.i18n.localize("RMU_CS.Common.UnknownSkill");

        // Build the costs & sacrifices summary for the GM
        const costsBreakdown = [];
        const critMap = { 1: "A", 2: "B", 3: "C", 4: "D", 5: "E" };

        for (const p of enabledParticipants) {
            const pp = p.ritualData.ppContributed || 0;
            const hp = p.ritualData.bloodDice || 0;
            const crit = p.ritualData.bloodCrit || 0;

            if (pp > 0 || hp > 0 || crit > 0) {
                const lines = [];
                if (pp > 0) lines.push(game.i18n.format("RMU_CS.Ritual.CostPP", { val: pp }));
                if (hp > 0) lines.push(game.i18n.format("RMU_CS.Ritual.CostHP", { val: hp }));
                if (crit > 0) lines.push(game.i18n.format("RMU_CS.Ritual.CostCrit", { type: critMap[crit] }));

                costsBreakdown.push({ name: p.name, lines });
            }
        }

        const content = await foundry.applications.handlebars.renderTemplate("modules/rmu-complementary-skills/templates/chat-ritual.hbs", {
            primaryActorName: primaryParticipant.name,
            primarySkillName: skillName,
            primaryBonus: calc.primaryBonus,
            modifiersTotal: calc.modifiersTotal,
            total: calc.total,
            breakdown: calc.breakdown,
            costsBreakdown: costsBreakdown,
        });

        await ChatMessage.create({
            user: game.user.id,
            content: content,
            whisper: this.#getRecipients(participants),
            flags: {
                "rmu-complementary-skills": {
                    isCalc: true,
                    rollType: "ritual",
                    actorId: primaryParticipant.actor.id,
                    skillUuid: skillUuid,
                    bonus: calc.modifiersTotal,
                },
            },
        });

        return true;
    }

    /**
     * Hooks into chat message rendering to attach roll logic to the custom buttons
     * generated by the ComplementarySkillsApp.
     * @param {ChatMessage} message - The chat message document.
     * @param {HTMLElement|jQuery} html - The rendered HTML of the message.
     */
    static onRenderChatMessage(message, html) {
        const flags = message.flags?.["rmu-complementary-skills"];
        if (!flags?.isCalc) return;

        const $html = $(html);
        $html.addClass("rmucsc-calc-message");

        const rtlLanguages = ["ar", "he", "fa", "ur"];
        if (rtlLanguages.includes(game.i18n.lang)) {
            $html.attr("dir", "rtl");
            $html.addClass("rtl");
        }

        const $button = $html.find(".rmu-roll-skill-button");
        if ($button.length === 0) return;

        const { rollType, actorId, skillUuid, bonus } = flags;

        $button.on("click", async (ev) => {
            const token = canvas.tokens.ownedTokens.find((t) => t.actor?.id === actorId);

            if (!token?.actor) {
                ui.notifications.warn(
                    game.i18n.format("RMU_CS.Notifications.TokenRequired", {
                        name: actorId,
                    }),
                );
                return;
            }

            const skillObject = RMUSkillParser.getRawSkillById(token.actor, skillUuid);

            if (!skillObject) {
                ui.notifications.error(game.i18n.localize("RMU_CS.Notifications.SkillNotFound"));
                return;
            }

            const maneuverOptions = {};

            // Route both Boost and Ritual to the same API handling logic
            if (rollType === "boost" || rollType === "ritual") {
                maneuverOptions.otherBonus = Number(bonus);
            } else if (rollType === "group") {
                maneuverOptions.overrideSkillBonus = Number(bonus);
            }

            if (game.system?.api?.rmuTokenSkillAction) {
                game.system.api.rmuTokenSkillAction(token, skillObject, maneuverOptions);
            } else {
                ui.notifications.error(game.i18n.localize("RMU_CS.Notifications.ApiNotFound"));
            }
        });
    }

    /**
     * Determines the appropriate recipients for the chat message, ensuring owners and GMs are notified.
     * @param {Map} participants - The map of participant data.
     * @returns {Array<string>} An array of user IDs.
     */
    static #getRecipients(participants) {
        const ownerIds = [];
        for (const p of Array.from(participants.values()).filter((p) => p.enabled)) {
            if (!p.actor) continue;
            for (const [userId, level] of Object.entries(p.actor.ownership)) {
                if (level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
                    ownerIds.push(userId);
                }
            }
        }
        const gmUsers = ChatMessage.getWhisperRecipients("GM");
        return Array.from(new Set([...ownerIds, ...gmUsers]));
    }
}
