import { RMUSkillParser } from "./RMUTokenParser.js";
import { BoostCalculator } from "./utils/BoostCalculator.js";
import { GroupCalculator } from "./utils/GroupCalculator.js";
import { RitualCalculator } from "./utils/RitualCalculator.js";
import { RITUAL_OPTIONS } from "./config.js";

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

        // Convert the map to an array for the new calculator logic
        const participantsArray = Array.from(participants.values());

        const calc = BoostCalculator.calculate(calcState, participantsArray, allPrimarySkills);
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

        // Convert the map to an array for the new calculator logic
        const participantsArray = Array.from(participants.values());

        const calc = GroupCalculator.calculate(calcState, participantsArray);
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

        // Determine if a critical type selection is required
        const hasCritSacrifice = enabledParticipants.some((p) => (p.ritualData.bloodCrit || 0) > 0);
        const permittedCritTypes = RITUAL_OPTIONS.bloodCritsTypes.filter((c) => c.permitted);

        // Build the costs & sacrifices summary for the GM and the execution payload
        const costsBreakdown = [];
        const sacrifices = [];

        for (const p of enabledParticipants) {
            const pp = p.ritualData.ppContributed || 0;
            const hp = p.ritualData.bloodDice || 0;
            const crit = p.ritualData.bloodCrit || 0;

            if (pp > 0 || hp > 0 || crit > 0) {
                // UI GM Summary
                const lines = [];
                if (pp > 0) lines.push(game.i18n.format("RMU_CS.Ritual.CostPP", { val: pp }));
                if (hp > 0) lines.push(game.i18n.format("RMU_CS.Ritual.CostHP", { val: hp }));
                if (crit > 0) {
                    const critObj = RITUAL_OPTIONS.bloodCrits.find((c) => c.value === crit);
                    lines.push(game.i18n.format("RMU_CS.Ritual.CostCrit", { type: critObj?.label || "" }));
                }
                costsBreakdown.push({ name: p.name, lines });

                // Mechanical Execution Payload
                sacrifices.push({
                    actorId: p.actor.id,
                    pp: pp,
                    hpDice: hp,
                    critSeverity: crit,
                });
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
            hasCritSacrifice: hasCritSacrifice,
            critTypes: permittedCritTypes.map((c) => ({
                ...c,
                isDefault: c.value === "Puncture",
            })),
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
                    hasCritSacrifice: hasCritSacrifice,
                    sacrifices: sacrifices,
                },
            },
        });

        return true;
    }

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

        const $rollButton = $html.find(".rmucsc-roll-skill-button");
        const $applyButton = $html.find(".rmucsc-apply-sacrifices-button");

        if ($rollButton.length === 0) return;

        // Unpack the flags, including our new sacrificesApplied state
        const { rollType, actorId, skillUuid, bonus, hasCritSacrifice, sacrifices, sacrificesApplied } = flags;

        // If the sacrifices were already applied in a previous session, disable the UI
        if (sacrificesApplied) {
            $applyButton.prop("disabled", true);
            $applyButton.html(` ${game.i18n.localize("RMU_CS.Ritual.Applied")}`);
            $html.find(".rmucsc-crit-type-select").prop("disabled", true);
        }

        // --- 1. SKILL ROLL HANDLER ---
        $rollButton.on("click", async (ev) => {
            const token = canvas.tokens.ownedTokens.find((t) => t.actor?.id === actorId);

            if (!token?.actor) {
                ui.notifications.warn(game.i18n.format("RMU_CS.Notifications.TokenRequired", { name: actorId }));
                return;
            }

            const skillObject = RMUSkillParser.getRawSkillById(token.actor, skillUuid);

            if (!skillObject) {
                ui.notifications.error(game.i18n.localize("RMU_CS.Notifications.SkillNotFound"));
                return;
            }

            try {
                const maneuverOptions = {};
                if (rollType === "boost" || rollType === "ritual") {
                    maneuverOptions.otherBonus = Number(bonus);
                } else if (rollType === "group") {
                    maneuverOptions.overrideSkillBonus = Number(bonus);
                }

                if (game.system?.api?.rmuTokenSkillAction) {
                    await game.system.api.rmuTokenSkillAction(token, skillObject, maneuverOptions);
                } else {
                    ui.notifications.error(game.i18n.localize("RMU_CS.Notifications.ApiNotFound"));
                }
            } catch (error) {
                console.error("RMU COMP SKILLS | Execution failed for primary skill roll:", error);
            }
        });

        // --- 2. SACRIFICE HANDLER ---
        $applyButton.on("click", async (ev) => {
            // Instantly disable the button on click to prevent accidental double-clicks
            $applyButton.prop("disabled", true);
            $html.find(".rmucsc-crit-type-select").prop("disabled", true);

            let selectedCritType = null;
            if (hasCritSacrifice) {
                selectedCritType = $html.find(".rmucsc-crit-type-select").val();
            }

            if (rollType === "ritual" && sacrifices?.length) {
                for (const sac of sacrifices) {
                    try {
                        const participantToken = canvas.tokens.ownedTokens.find((t) => t.actor?.id === sac.actorId);
                        const participantActor = participantToken?.actor || game.actors.get(sac.actorId);

                        if (!participantActor) continue;

                        const tokenIntent = participantToken || participantActor.id;

                        const summaryData = {
                            participantName: participantActor.name,
                            pp: sac.pp > 0 ? sac.pp : null,
                            hp: null,
                            hpDice: sac.hpDice,
                            crit: null,
                        };

                        // 1. Deduct Power Points
                        if (sac.pp > 0) {
                            if (game.system?.api?.rmuMacroAdjustPowerPoints) {
                                await game.system.api.rmuMacroAdjustPowerPoints(tokenIntent, -sac.pp);
                            } else {
                                console.warn("RMU COMP SKILLS | rmuMacroAdjustPowerPoints API not found.");
                            }
                        }

                        // 2. Roll and Deduct Hit Points
                        if (sac.hpDice > 0) {
                            const roll = new Roll(`${sac.hpDice}d10`);
                            await roll.evaluate();
                            summaryData.hp = roll.total;

                            if (game.system?.api?.rmuMacroAdjustHitPoints) {
                                await game.system.api.rmuMacroAdjustHitPoints(tokenIntent, -summaryData.hp);
                            } else {
                                console.warn("RMU COMP SKILLS | rmuMacroAdjustHitPoints API not found.");
                            }
                        }

                        // 3. Apply System Critical
                        if (sac.critSeverity > 0 && selectedCritType) {
                            const critObj = RITUAL_OPTIONS.bloodCrits.find((c) => c.value === sac.critSeverity);
                            const severityLetter = critObj?.label || "";
                            summaryData.crit = `${selectedCritType} (${severityLetter})`;

                            if (game.system?.api?.rmuMacroTargetCritical) {
                                await game.system.api.rmuMacroTargetCritical(tokenIntent, {
                                    sourceOfAttackName: game.i18n.localize("RMU_CS.Ritual.ChatTitle"),
                                    criticalName: selectedCritType,
                                    severity: severityLetter,
                                    extraHits: 0,
                                    location: "none",
                                    bonus: 0,
                                    prompt: false,
                                });
                            } else {
                                console.warn("RMU COMP SKILLS | rmuMacroTargetCritical API not found.");
                            }
                        }

                        // 4. Dispatch Custom Chat Card
                        if (summaryData.pp || summaryData.hp || summaryData.crit) {
                            const content = await foundry.applications.handlebars.renderTemplate("modules/rmu-complementary-skills/templates/chat-sacrifice.hbs", summaryData);

                            await ChatMessage.create({
                                speaker: ChatMessage.getSpeaker({ actor: participantActor }),
                                content: content,
                                flags: {
                                    "rmu-complementary-skills": { isCalc: true },
                                },
                                whisper: ChatMessage.getWhisperRecipients("GM")
                                    .map((u) => u.id)
                                    .concat(
                                        Object.entries(participantActor.ownership)
                                            .filter(([id, level]) => id !== "default" && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)
                                            .map(([id, _]) => id),
                                    ),
                            });
                        }
                    } catch (error) {
                        console.error(`RMU COMP SKILLS | Execution failed for participant ${sac.actorId}:`, error);
                        ui.notifications.error(`Failed to process sacrifices for one or more participants. Check console.`);
                    }
                }

                // 5. Save the state to the message flag so it persists permanently
                await message.setFlag("rmu-complementary-skills", "sacrificesApplied", true);

                // Update the button text to show completion
                $applyButton.html(`<i class="rmucsc-icon check"></i> ${game.i18n.localize("RMU_CS.Ritual.Applied")}`);
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
                // Skip the "default" key to avoid pushing a 7-character string
                if (userId !== "default" && level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
                    ownerIds.push(userId);
                }
            }
        }

        // Map the array of User objects to an array of 16-character ID strings
        const gmUsers = ChatMessage.getWhisperRecipients("GM").map((u) => u.id);

        return Array.from(new Set([...ownerIds, ...gmUsers]));
    }
}
