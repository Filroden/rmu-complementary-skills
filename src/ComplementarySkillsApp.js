import { RMUSkillParser } from "./RMUSkillParser.js";
import { VALID_ACTOR_TYPES } from "./config.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Unified application for calculating RMU Complementary Skills.
 * Handles both Boost Skill and Group Task calculations via tabs,
 * alongside a reactive side-panel for adding participants.
 */
export class ComplementarySkillsApp extends HandlebarsApplicationMixin(ApplicationV2) {
    constructor(tokens, options = {}) {
        super(options);

        // Store original token IDs safely (handles unlinked tokens via canvas lookup)
        this.tokenIds = new Set(tokens.map((t) => t.id));
        this.participants = new Map();

        // Unified state management
        this.calcState = {
            activeTab: "boost",
            sidePanelOpen: false,
            candidatesToAdd: new Set(),

            // Boost State
            primaryActorId: null,
            primarySkillUuid: null,
            primarySkillName: null,
            primaryActorSkills: [],
            otherActorSkills: {},

            // Group State
            leaderId: null,
            taskSkillUuid: null,
            taskSkillName: null,
        };

        // Tracks if we are currently fetching data to prevent race conditions
        this._isHydrating = false;
    }

    static DEFAULT_OPTIONS = {
        id: "rmu-complementary-skills-app",
        classes: ["rmu-calc-app", "rmu-unified-app"],
        tag: "div",
        window: {
            title: "RMU_CS.Title",
            resizable: true,
            controls: [
                {
                    icon: "rmu-icon rmu-icon-group-skill",
                    label: "RMU_CS.Common.AddParticipant",
                    action: "toggleSidePanel",
                },
            ],
        },
        position: { height: "auto" },
        actions: {
            toggleSidePanel: ComplementarySkillsApp.#toggleSidePanel,
            toggleCandidate: ComplementarySkillsApp.#toggleCandidate,
            confirmAddParticipants: ComplementarySkillsApp.#confirmAddParticipants,
        },
    };

    static PARTS = {
        tabs: { template: "modules/rmu-complementary-skills/templates/tabs.hbs" },
        boost: { template: "modules/rmu-complementary-skills/templates/boost-tab.hbs" },
        group: { template: "modules/rmu-complementary-skills/templates/group-tab.hbs" },
        sidePanel: { template: "modules/rmu-complementary-skills/templates/add-participant-panel.hbs" },
    };

    /**
     * Core data hydration loop. Resolves all token data asynchronously
     * before allowing the UI to render, preventing race conditions.
     */
    async _hydrateParticipants() {
        if (this._isHydrating) return;
        this._isHydrating = true;

        for (const id of this.tokenIds) {
            if (this.participants.has(id)) continue;

            // Always look up the token instance on the canvas to support synthetic/unlinked actors
            const token = canvas.tokens.placeables.find((t) => t.id === id);
            if (!token || !token.actor) continue;

            const allSkills = await RMUSkillParser.getSkillsForToken(token);
            const leadershipRanks = RMUSkillParser.getLeadershipRanks(allSkills);

            const skillsWithRanks = allSkills
                .map(RMUSkillParser.getSkillData)
                .filter((sk) => sk.ranks > 0 && !sk.disabledBySystem)
                .sort(RMUSkillParser.sortSkills);

            this.participants.set(id, {
                id: token.id,
                name: token.name,
                actor: token.actor,
                enabled: true,
                leadershipRanks: leadershipRanks,
                allSkills: skillsWithRanks,
                allSkillsGrouped: RMUSkillParser.groupSkills(skillsWithRanks),
            });
        }

        this._enforceDeterministicLeader();
        this._isHydrating = false;
    }

    /**
     * Calculates the group leader. If there is a tie in Leadership ranks,
     * it deterministically breaks the tie using the alphanumeric token ID.
     */
    _enforceDeterministicLeader() {
        const enabledParticipants = Array.from(this.participants.values()).filter((p) => p.enabled);
        if (enabledParticipants.length === 0) return;

        const bestLeader = enabledParticipants.reduce((prev, current) => {
            if (current.leadershipRanks > prev.leadershipRanks) return current;
            if (current.leadershipRanks === prev.leadershipRanks) {
                // Alphanumeric tie-breaker ensures identical client/server resolution
                return current.id.localeCompare(prev.id) > 0 ? current : prev;
            }
            return prev;
        });

        if (!this.calcState.leaderId || !this.participants.get(this.calcState.leaderId)?.enabled) {
            this.calcState.leaderId = bestLeader.id;
        }
    }

    async _prepareContext(options) {
        await this._hydrateParticipants();
        return {
            activeTab: this.calcState.activeTab,
            sidePanelOpen: this.calcState.sidePanelOpen,
        };
    }

    /**
     * Prepares the specific data context for each UI part before rendering.
     * @param {string} partId - The ID of the part being rendered.
     * @param {object} context - The base context object.
     * @param {object} options - Rendering options.
     * @returns {Promise<object>} The enriched context object.
     */
    async _preparePartContext(partId, context, options) {
        if (partId === "sidePanel") {
            const allTokens = canvas.tokens.placeables;
            const availableTokens = allTokens.filter((t) => t.actor && VALID_ACTOR_TYPES.includes(t.actor.type) && !this.tokenIds.has(t.id));
            return { ...context, availableTokens };
        }

        if (partId === "boost") {
            const participants = Array.from(this.participants.values()).filter((p) => p.enabled);
            if (participants.length === 0) return { ...context, participants: [] };

            // Ensure the primary actor is valid and enabled; otherwise, reset to the first available.
            if (!this.calcState.primaryActorId || !this.participants.get(this.calcState.primaryActorId)?.enabled) {
                this.calcState.primaryActorId = participants[0]?.id || null;
                this.calcState.primarySkillUuid = null;
                this.calcState.primarySkillName = null;
                this.calcState.primaryActorSkills = [];
            }

            const primaryActor = this.participants.get(this.calcState.primaryActorId);

            // Fetch all skills for the primary actor, including those with 0 ranks.
            const allPrimarySkills =
                primaryActor && primaryActor.actor
                    ? RMUSkillParser._getAllActorSkills(primaryActor.actor)
                          .map(RMUSkillParser.getSkillData)
                          .filter((sk) => !sk.disabledBySystem)
                          .sort(RMUSkillParser.sortSkills)
                    : [];

            // Update the display bonus for the selected skill across all participants.
            for (const p of this.participants.values()) {
                const pSkills = p.actor ? RMUSkillParser._getAllActorSkills(p.actor).map(RMUSkillParser.getSkillData) : [];
                const skill = pSkills.find((s) => s.name === this.calcState.primarySkillName);
                p.bonusForSelectedSkill = skill ? skill.bonus : 0;
            }

            return {
                ...context,
                participants: Array.from(this.participants.values()),
                primaryActorId: this.calcState.primaryActorId,
                primarySkillOptions: RMUSkillParser.groupSkills(allPrimarySkills),
                primarySkillUuid: this.calcState.primarySkillUuid,
                primaryComplementOptions: RMUSkillParser.groupSkills(primaryActor?.allSkills || []),
                primaryActorSkills: this.calcState.primaryActorSkills,
                otherParticipants: participants.filter((p) => p.id !== this.calcState.primaryActorId),
                otherActorSkills: this.calcState.otherActorSkills,
                calculation: this.#calculateBoostBonus(allPrimarySkills),
            };
        }

        if (partId === "group") {
            const participants = Array.from(this.participants.values()).filter((p) => p.enabled);

            // Verify the leader is still enabled; recalculate if not.
            if (!this.participants.get(this.calcState.leaderId)?.enabled) {
                this._enforceDeterministicLeader();
            }

            // Create a unified list of all available skills from all participants for the dropdown.
            const skillMap = new Map();
            for (const p of this.participants.values()) {
                const allRawSkills = RMUSkillParser._getAllActorSkills(p.actor);
                for (const raw of allRawSkills) {
                    const data = RMUSkillParser.getSkillData(raw);
                    if (!data.disabledBySystem && !skillMap.has(data.name)) {
                        skillMap.set(data.name, data);
                    }
                }
            }

            // Calculate the specific bonus for the chosen task skill for each participant.
            for (const p of this.participants.values()) {
                if (!this.calcState.taskSkillName) {
                    p.bonusForSelectedSkill = 0;
                    continue;
                }
                const match = RMUSkillParser.getBestSkillMatch(p.actor, this.calcState.taskSkillName);
                const skillData = match ? RMUSkillParser.getSkillData(match) : null;
                p.bonusForSelectedSkill = skillData ? skillData.bonus : 0;
            }

            return {
                ...context,
                participants: Array.from(this.participants.values()),
                leaderId: this.calcState.leaderId,
                allSkillOptions: RMUSkillParser.groupSkills(Array.from(skillMap.values()).sort(RMUSkillParser.sortSkills)),
                taskSkillName: this.calcState.taskSkillName,
                calculation: this.#calculateGroupBonus(),
            };
        }

        return context;
    }

    /**
     * Fires after the application has finished rendering.
     * Injects RTL support for specific languages.
     * @param {object} context - The rendered context.
     * @param {object} options - Rendering options.
     */
    _onRender(context, options) {
        super._onRender(context, options);

        const rtlLanguages = ["ar", "he", "fa", "ur"];
        if (rtlLanguages.includes(game.i18n.lang)) {
            this.element.setAttribute("dir", "rtl");
            this.element.classList.add("rtl");
        }
    }

    /* ----------------------------------------- */
    /* Action Handlers                          */
    /* ----------------------------------------- */

    static #toggleSidePanel(event, target) {
        this.calcState.sidePanelOpen = !this.calcState.sidePanelOpen;

        // Check if the user has manually resized the window
        if (typeof this.position.width === "number") {
            const panelWidthPx = 300; // 18.75rem = 300px
            const isRTL = this.element.classList.contains("rtl");

            let newWidth = this.position.width;
            let newLeft = this.position.left;

            if (this.calcState.sidePanelOpen) {
                // Opening: Expand width. If RTL, push the left anchor backwards to grow leftwards.
                newWidth += panelWidthPx;
                if (isRTL && newLeft !== null) newLeft -= panelWidthPx;
            } else {
                // Closing: Shrink width. If RTL, pull the left anchor forwards.
                newWidth -= panelWidthPx;
                if (isRTL && newLeft !== null) newLeft += panelWidthPx;
            }

            this.setPosition({ width: newWidth, left: newLeft });
        }

        // Only re-render the side panel part to animate it smoothly
        this.render({ parts: ["sidePanel"] });
    }

    static #toggleCandidate(event, target) {
        const id = target.value;
        if (target.checked) this.calcState.candidatesToAdd.add(id);
        else this.calcState.candidatesToAdd.delete(id);
    }

    static async #confirmAddParticipants(event, target) {
        for (const id of this.calcState.candidatesToAdd) {
            this.tokenIds.add(id);
        }
        this.calcState.candidatesToAdd.clear();
        this.calcState.sidePanelOpen = false;

        // Hydrate the new tokens, then trigger a full UI refresh
        await this._hydrateParticipants();
        this.render({ force: true });
    }

    /**
     * Attaches event listeners to the rendered HTML of a specific part.
     * @param {string} partId - The ID of the part being rendered.
     * @param {HTMLElement} htmlElement - The root element of the rendered part.
     * @param {object} options - Rendering options.
     */
    _attachPartListeners(partId, htmlElement, options) {
        super._attachPartListeners(partId, htmlElement, options);
        const $html = $(htmlElement);

        if (partId === "tabs") {
            $html.find(".item").on("click", (ev) => {
                this.calcState.activeTab = ev.currentTarget.dataset.tab;
                $html.find(".item").removeClass("active");
                $(ev.currentTarget).addClass("active");

                // Toggle visibility via CSS classes
                $(this.element).find(".rmu-tab-content").removeClass("active");
                $(this.element).find(`.rmu-tab-content[data-tab="${this.calcState.activeTab}"]`).addClass("active");
            });
        }

        if (partId === "boost") {
            $html.find(".rmu-participant-enable").on("change", (e) => {
                const participant = this.participants.get(e.currentTarget.dataset.id);
                if (participant) participant.enabled = e.currentTarget.checked;
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmu-primary-actor-select").on("change", (e) => {
                this.calcState.primaryActorId = e.currentTarget.value;
                this.calcState.primarySkillUuid = null;
                this.calcState.primarySkillName = null;
                this.calcState.primaryActorSkills = [];
                this.calcState.otherActorSkills = {};
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmu-primary-skill-select").on("change", (e) => {
                const uuid = e.currentTarget.value;
                const primaryActor = this.participants.get(this.calcState.primaryActorId);
                const allSkills = primaryActor && primaryActor.actor ? RMUSkillParser._getAllActorSkills(primaryActor.actor).map(RMUSkillParser.getSkillData) : [];
                const skillData = allSkills.find((s) => s.uuid === uuid);

                this.calcState.primarySkillUuid = uuid;
                this.calcState.primarySkillName = skillData ? skillData.name : null;
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmu-primary-comp-add").on("click", () => {
                this.calcState.primaryActorSkills.push({ name: null, ranks: 0 });
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmu-primary-comp-skill").on("change", (e) => {
                const index = e.currentTarget.dataset.index;
                const skillUuid = e.currentTarget.value;
                const primaryActor = this.participants.get(this.calcState.primaryActorId);
                const skillData = primaryActor?.allSkills.find((s) => s.uuid === skillUuid);

                this.calcState.primaryActorSkills[index] = {
                    uuid: skillUuid,
                    name: skillData?.name || game.i18n.localize("RMU_CS.Common.UnknownSkill"),
                    ranks: skillData?.ranks || 0,
                };
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmu-primary-comp-delete").on("click", (e) => {
                const index = e.currentTarget.dataset.index;
                this.calcState.primaryActorSkills.splice(index, 1);
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmu-other-comp-skill").on("change", (e) => {
                const actorId = e.currentTarget.dataset.id;
                this.calcState.otherActorSkills[actorId] = e.currentTarget.value;
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmu-send-chat").on("click", this.#onSendBoostToChat.bind(this));
        }

        if (partId === "group") {
            $html.find(".rmu-participant-enable").on("change", (e) => {
                const participant = this.participants.get(e.currentTarget.dataset.id);
                if (participant) participant.enabled = e.currentTarget.checked;
                this.render({ parts: ["group"] });
            });

            $html.find(".rmu-leader-select").on("change", (e) => {
                this.calcState.leaderId = e.currentTarget.value;
                this.render({ parts: ["group"] });
            });

            $html.find(".rmu-task-skill-select").on("change", (e) => {
                const select = e.currentTarget;
                this.calcState.taskSkillUuid = select.value;
                this.calcState.taskSkillName = select.options[select.selectedIndex].text.trim();
                this.render({ parts: ["group"] });
            });

            $html.find(".rmu-send-chat").on("click", this.#onSendGroupToChat.bind(this));
        }
    }

    /* ----------------------------------------- */
    /* Calculation Logic                         */
    /* ----------------------------------------- */

    #calculateBoostBonus(allPrimarySkills) {
        const primaryActor = this.participants.get(this.calcState.primaryActorId);
        if (!primaryActor) return {};

        const primarySkill = allPrimarySkills.find((s) => s.uuid === this.calcState.primarySkillUuid);
        const primaryBonus = primarySkill?.bonus || 0;

        let complementRanks = [];

        // Gather primary actor's complementary skills
        for (const skill of this.calcState.primaryActorSkills) {
            if (skill.ranks > 0) {
                complementRanks.push({
                    name: game.i18n.format("RMU_CS.Boost.BreakdownNameFormat", { actorName: primaryActor.name, skillName: skill.name }),
                    ranks: skill.ranks,
                });
            }
        }

        // Gather other participants' complementary skills
        for (const [actorId, skillUuid] of Object.entries(this.calcState.otherActorSkills)) {
            const participant = this.participants.get(actorId);
            if (participant && participant.enabled && skillUuid) {
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

    #calculateGroupBonus() {
        const participants = Array.from(this.participants.values()).filter((p) => p.enabled);
        if (participants.length === 0) return {};

        let totalBonus = 0;
        const participantBonuses = [];

        for (const p of participants) {
            const bonus = p.bonusForSelectedSkill || 0;
            totalBonus += bonus;
            participantBonuses.push({ name: p.name, bonus: bonus });
        }

        const averageBonus = participants.length > 0 ? totalBonus / participants.length : 0;
        const leader = this.participants.get(this.calcState.leaderId);
        const leadershipBonus = leader && leader.enabled ? leader.leadershipRanks : 0;

        return {
            taskSkillName: this.calcState.taskSkillName,
            participants: participantBonuses,
            averageBonus: Math.round(averageBonus),
            leadershipBonus: leadershipBonus,
            leaderName: leader?.name || game.i18n.localize("RMU_CS.Group.LeaderNone"),
            total: Math.round(averageBonus) + leadershipBonus,
        };
    }

    /* ----------------------------------------- */
    /* Chat Logic                                */
    /* ----------------------------------------- */

    async #onSendBoostToChat(event) {
        const primaryActor = this.participants.get(this.calcState.primaryActorId);
        if (!primaryActor || !this.calcState.primarySkillUuid) {
            ui.notifications.warn(game.i18n.localize("RMU_CS.Notifications.SelectPrimary"));
            return;
        }

        const allPrimarySkills = RMUSkillParser._getAllActorSkills(primaryActor.actor)
            .map(RMUSkillParser.getSkillData)
            .filter((sk) => !sk.disabledBySystem);

        const calc = this.#calculateBoostBonus(allPrimarySkills);
        const content = await foundry.applications.handlebars.renderTemplate("modules/rmu-complementary-skills/templates/chat-boost-skill.hbs", {
            primaryActorName: primaryActor.name,
            primarySkillName: this.calcState.primarySkillName,
            primaryBonus: calc.primaryBonus,
            breakdown: calc.breakdown,
            complementBonus: calc.complementBonus,
            total: calc.total,
        });

        ChatMessage.create({
            user: game.user.id,
            content: content,
            whisper: this.#getRecipients(),
            flags: {
                "rmu-complementary-skills": {
                    isCalc: true,
                    rollType: "boost",
                    actorId: primaryActor.actor.id,
                    skillUuid: this.calcState.primarySkillUuid,
                    bonus: calc.complementBonus,
                },
            },
        });

        this.close();
    }

    async #onSendGroupToChat(event) {
        const leader = this.participants.get(this.calcState.leaderId);
        if (!leader || !this.calcState.taskSkillName) {
            ui.notifications.warn(game.i18n.localize("RMU_CS.Notifications.SelectTask"));
            return;
        }

        const calc = this.#calculateGroupBonus();
        const leaderRaw = RMUSkillParser.getBestSkillMatch(leader.actor, this.calcState.taskSkillName);
        const leaderData = leaderRaw ? RMUSkillParser.getSkillData(leaderRaw) : null;
        const leaderSkillUuid = leaderData ? leaderData.uuid : this.calcState.taskSkillUuid;

        const content = await foundry.applications.handlebars.renderTemplate("modules/rmu-complementary-skills/templates/chat-group-task.hbs", calc);

        ChatMessage.create({
            user: game.user.id,
            content: content,
            whisper: this.#getRecipients(),
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

        this.close();
    }

    #getRecipients() {
        const ownerIds = [];
        for (const p of Array.from(this.participants.values()).filter((p) => p.enabled)) {
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
