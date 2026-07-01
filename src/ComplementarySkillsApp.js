import { RMUSkillParser, RMUActorParser } from "./RMUTokenParser.js";
import { BoostCalculator } from "./utils/BoostCalculator.js";
import { GroupCalculator } from "./utils/GroupCalculator.js";
import { RitualCalculator } from "./utils/RitualCalculator.js";
import { ChatManager } from "./ChatManager.js";
import { VALID_ACTOR_TYPES, RITUAL_OPTIONS } from "./config.js";

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

            // Ritual State
            ritualState: {
                targetSpells: [{ id: foundry.utils.randomID(), level: 1, basePPCost: 1, listType: 0, listKnowledge: 0 }],
                totalSpellLevel: 1,
                totalBasePPCost: 1,

                detailsState: {
                    environment: false,
                    items: false,
                    parameters: false,
                },

                investingTime: 0,
                auspiciousTime: 0,
                auspiciousLocation: 0,
                auspiciousProphecy: 0,
                inauspiciousTime: 0,
                inauspiciousLocation: 0,
                inauspiciousProphecy: 0,

                toolValue: 0,
                toolAppropriateness: 0,
                sacrificeValue: 0,
                sacrificeAppropriateness: 0,

                paramWeight: 0,
                paramAoE: 0,
                paramRange: 0,
                paramDecreaseAoE: false,

                paramCrit: 0,
                paramHitMult: 0,

                paramDurNoToRound: false,
                paramDurConcToRndLvl: false,
                paramDurRemoveConc: false,
                paramDurBase: 0,
                paramDurTarget: 0,
            },
            ritualParticipantData: {},
        };

        // Tracks if we are currently fetching data to prevent race conditions
        this._isHydrating = false;
    }

    static DEFAULT_OPTIONS = {
        id: "rmu-complementary-skills-app",
        classes: ["rmucsc"],
        tag: "div",
        window: {
            title: "RMU_CS.Title",
            resizable: true,
            controls: [
                {
                    icon: "rmu-icon group-skill",
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
            addRitualSpell: ComplementarySkillsApp.#addRitualSpell,
            removeSpell: ComplementarySkillsApp.#removeSpell,
            removeParticipant: ComplementarySkillsApp.#removeParticipant,
        },
    };

    static PARTS = {
        tabs: { template: "modules/rmu-complementary-skills/templates/tabs.hbs" },
        boost: { template: "modules/rmu-complementary-skills/templates/boost-tab.hbs" },
        group: { template: "modules/rmu-complementary-skills/templates/group-tab.hbs" },
        ritual: { template: "modules/rmu-complementary-skills/templates/ritual-tab.hbs" },
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
            if (!token?.actor) continue;

            const allSkills = await RMUSkillParser.getSkillsForToken(token);
            const leadershipRanks = RMUSkillParser.getLeadershipRanks(allSkills);
            const attributes = RMUActorParser.getRitualAttributes(token);

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
                attributes: attributes,
                allSkills: skillsWithRanks,
                allSkillsGrouped: RMUSkillParser.groupSkills(skillsWithRanks),
            });

            // Initialise ritual data if it does not exist
            if (!this.calcState.ritualParticipantData[id]) {
                this.calcState.ritualParticipantData[id] = this.#getDefaultRitualData();
            }
        }

        this._enforceDeterministicLeader();
        this._enforceDeterministicPrimaryCaster();
        this._isHydrating = false;
    }

    /**
     * Generates the default ritual data schema for a new participant.
     * @returns {object} Default ritual data state.
     */
    #getDefaultRitualData() {
        return {
            role: "minor", // Defaults to minor to prevent accidental Primary assignment
            ritualSkillUuid: null,
            additionalSkillUuid: null,
            ppContributed: 0,
            bloodDice: 0,
            bloodCrit: 0,
        };
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
        }, enabledParticipants[0]); // Explicit initial value added here

        if (!this.calcState.leaderId || !this.participants.get(this.calcState.leaderId)?.enabled) {
            this.calcState.leaderId = bestLeader.id;
        }
    }

    /**
     * Guarantees exactly one enabled participant is assigned the "primary" role.
     * Auto-assigns the highest level participant if none exists, using ID as a tie-breaker.
     * Demotes any duplicate primaries to "major".
     */
    _enforceDeterministicPrimaryCaster() {
        const enabledParticipants = Array.from(this.participants.values()).filter((p) => p.enabled);
        if (enabledParticipants.length === 0) return;

        const primaries = enabledParticipants.filter((p) => this.calcState.ritualParticipantData[p.id]?.role === "primary");

        if (primaries.length === 1) return; // Exactly one primary, state is valid.

        // Determine the best candidate (either from the duplicates, or from all if none exist)
        const pool = primaries.length > 1 ? primaries : enabledParticipants;
        const bestCandidate = pool.reduce((prev, current) => {
            if (current.attributes.level > prev.attributes.level) return current;
            if (current.attributes.level === prev.attributes.level) {
                return current.id.localeCompare(prev.id) > 0 ? current : prev;
            }
            return prev;
        }, pool[0]); // Explicit initial value added here

        // Enforce the singleton primary rule
        for (const p of enabledParticipants) {
            const data = this.calcState.ritualParticipantData[p.id];
            if (p.id === bestCandidate.id) {
                data.role = "primary";
            } else if (data.role === "primary") {
                data.role = "major";
            }
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
            const allPrimarySkills = primaryActor?.actor
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
                calculation: BoostCalculator.calculate(this.calcState, this.participants, allPrimarySkills),
            };
        }

        if (partId === "group") {
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
                calculation: GroupCalculator.calculate(this.calcState, this.participants),
            };
        }

        if (partId === "ritual") {
            // Map the participants and isolate their ritual-specific data
            const ritualParticipants = Array.from(this.participants.values()).map((p) => {
                // Identify specifically ritualistic skills
                const ritualSkills = p.allSkills.filter((sk) => {
                    const search = (sk.name + " " + sk.category).toLowerCase();
                    return search.includes("magical ritual");
                });

                const ritualData = this.calcState.ritualParticipantData[p.id];

                return {
                    ...p,
                    maxPP: p.attributes.currentPP,
                    ritualData: ritualData,
                    ritualSkillsGrouped: RMUSkillParser.groupSkills(ritualSkills),
                    canInvestBlood: p.enabled && ritualData.role !== "minor",
                };
            });

            // Calculate the math (This is the crucial step that was missing!)
            const enabledParticipants = ritualParticipants.filter((p) => p.enabled);
            const calculation = RitualCalculator.calculateTotalRitualBonus(this.calcState.ritualState, enabledParticipants);

            // Return the full context to the Handlebars template
            return {
                ...context,
                targetSpells: this.calcState.ritualState.targetSpells,
                ritualParticipants: ritualParticipants,
                ritualOptions: RITUAL_OPTIONS,
                ritualState: this.calcState.ritualState,
                calculation: calculation,
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

    static #addRitualSpell(event, target) {
        this.calcState.ritualState.targetSpells.push({
            id: foundry.utils.randomID(),
            level: 1,
            basePPCost: 1,
            listType: 0,
            listKnowledge: 0,
        });
        this.#updateRitualTotals();
        this.render({ parts: ["ritual"] });
    }

    #updateRitualTotals() {
        const spells = this.calcState.ritualState.targetSpells;
        const totalLevel = spells.reduce((sum, s) => sum + s.level, 0);

        this.calcState.ritualState.totalSpellLevel = totalLevel;
        this.calcState.ritualState.totalBasePPCost = totalLevel;
    }
    static #removeSpell(event, target) {
        if (this.calcState.ritualState.targetSpells.length <= 1) return; // Always keep one row
        const id = target.dataset.id;
        this.calcState.ritualState.targetSpells = this.calcState.ritualState.targetSpells.filter((s) => s.id !== id);
        this.#updateRitualTotals();
        this.render({ parts: ["ritual"] });
    }

    static #removeParticipant(event, target) {
        const id = target.dataset.id;
        this.participants.delete(id);
        this.tokenIds.delete(id);
        delete this.calcState.ritualParticipantData[id];
        this._enforceDeterministicPrimaryCaster();
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
                const allSkills = primaryActor?.actor ? RMUSkillParser._getAllActorSkills(primaryActor.actor).map(RMUSkillParser.getSkillData) : [];
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

        if (partId === "ritual") {
            htmlElement.addEventListener("change", this.#onRitualTabChange.bind(this));
            htmlElement.addEventListener("toggle", this.#onRitualTabToggle.bind(this), true);
            $html.find(".rmu-send-chat").on("click", this.#onSendRitualToChat.bind(this));
        }
    }

    #onRitualTabChange(event) {
        const target = event.target;
        const ritualState = this.calcState.ritualState;
        const pData = this.calcState.ritualParticipantData;
        const id = target.dataset.id;

        // 1. Handle Global Modifiers (using the 'name' attribute)
        const globalNames = [
            "investingTime",
            "toolValue",
            "toolAppropriateness",
            "sacrificeValue",
            "sacrificeAppropriateness",
            "paramWeight",
            "paramAoE",
            "paramRange",
            "paramCrit",
            "paramHitMult",
            "paramDurBase",
            "paramDurTarget",
        ];

        if (globalNames.includes(target.name)) {
            ritualState[target.name] = Number.parseInt(target.value, 10) || 0;
            return this.render({ parts: ["ritual"] });
        }

        const checkboxNames = ["paramDecreaseAoE", "paramDurNoToRound", "paramDurConcToRndLvl", "paramDurRemoveConc"];
        if (checkboxNames.includes(target.name)) {
            ritualState[target.name] = target.checked;
            return this.render({ parts: ["ritual"] });
        }

        // Circumstance Grid Clamping
        const circumstanceNames = ["auspiciousTime", "auspiciousLocation", "auspiciousProphecy", "inauspiciousTime", "inauspiciousLocation", "inauspiciousProphecy"];
        if (circumstanceNames.includes(target.name)) {
            let val = Number.parseInt(target.value, 10) || 0;
            const isAuspicious = target.name.startsWith("auspicious");

            const min = isAuspicious ? 0 : -25;
            const max = isAuspicious ? 25 : 0;

            if (val > max) val = max;
            if (val < min) val = min;

            ritualState[target.name] = val;
            target.value = val; // Force DOM to reflect the clamp instantly
            return this.render({ parts: ["ritual"] });
        }

        // 2. Handle Spell Grid
        if (target.classList.contains("rmu-spell-level")) {
            const spell = ritualState.targetSpells.find((s) => s.id === id);
            if (spell) {
                spell.level = Number.parseInt(target.value, 10) || 1;
                this.#updateRitualTotals();
            }
            return this.render({ parts: ["ritual"] });
        }
        if (target.classList.contains("rmu-spell-type")) {
            const spell = ritualState.targetSpells.find((s) => s.id === id);
            if (spell) spell.listType = Number.parseInt(target.value, 10) || 0;
            return this.render({ parts: ["ritual"] });
        }
        if (target.classList.contains("rmu-spell-knowledge")) {
            const spell = ritualState.targetSpells.find((s) => s.id === id);
            if (spell) spell.listKnowledge = Number.parseInt(target.value, 10) || 0;
            return this.render({ parts: ["ritual"] });
        }

        // 3. Handle Participant Grid
        if (target.classList.contains("rmu-participant-enable")) {
            const participant = this.participants.get(id);
            if (participant) participant.enabled = target.checked;
            this._enforceDeterministicPrimaryCaster(); // Ensure primary wasn't disabled
            return this.render({ parts: ["ritual"] });
        }

        if (target.classList.contains("rmu-ritual-role-select")) {
            const newRole = target.value;

            if (newRole === "primary") {
                // Demote any existing primary caster to 'major'
                for (const [pId, data] of Object.entries(pData)) {
                    if (pId !== id && data.role === "primary") data.role = "major";
                }
            }

            // Clear blood sacrifices upon demotion to 'minor'
            if (newRole === "minor") {
                pData[id].bloodDice = 0;
                pData[id].bloodCrit = 0;
            }

            pData[id].role = newRole;
            this._enforceDeterministicPrimaryCaster(); // Failsafe validation
            return this.render({ parts: ["ritual"] });
        }

        if (target.classList.contains("rmu-ritual-skill-select")) {
            pData[id].ritualSkillUuid = target.value;
            return this.render({ parts: ["ritual"] });
        }
        if (target.classList.contains("rmu-ritual-additional-select")) {
            pData[id].additionalSkillUuid = target.value;
            return this.render({ parts: ["ritual"] });
        }

        if (target.classList.contains("rmu-ritual-pp-input")) {
            const participant = this.participants.get(id);
            const maxPP = participant ? participant.attributes.currentPP : 0;
            let val = Number.parseInt(target.value, 10) || 0;

            // Clamp the value between 0 and the actor's current max PP
            if (val > maxPP) val = maxPP;
            if (val < 0) val = 0;

            pData[id].ppContributed = val;
            target.value = val; // Force the DOM to reflect the clamp instantly
            return this.render({ parts: ["ritual"] });
        }

        if (target.classList.contains("rmu-ritual-hits-select")) {
            pData[id].bloodDice = Number.parseInt(target.value, 10) || 0;
            return this.render({ parts: ["ritual"] });
        }
        if (target.classList.contains("rmu-ritual-crit-select")) {
            pData[id].bloodCrit = Number.parseInt(target.value, 10) || 0;
            return this.render({ parts: ["ritual"] });
        }
    }

    #onRitualTabToggle(event) {
        const target = event.target;
        if (target.tagName === "DETAILS" && target.dataset.section) {
            this.calcState.ritualState.detailsState[target.dataset.section] = target.open;
        }
    }

    /* ----------------------------------------- */
    /* Chat Logic                                */
    /* ----------------------------------------- */

    async #onSendBoostToChat(event) {
        const success = await ChatManager.sendBoostToChat(this.calcState, this.participants);
        if (success) this.close();
    }

    async #onSendGroupToChat(event) {
        const success = await ChatManager.sendGroupToChat(this.calcState, this.participants);
        if (success) this.close();
    }

    async #onSendRitualToChat(event) {
        const success = await ChatManager.sendRitualToChat(this.calcState, this.participants);
        if (success) this.close();
    }
}
