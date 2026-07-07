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
            detailsState: {
                boostBreakdown: false,
            },

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
                    breakdown: false,
                },

                // Endurance Workflow State
                enduranceGrid: [],
                enduranceHeaders: [],
                enduranceColumns: 0,
                endurancePrimaryFailed: false,
                endurancePending: false,

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
                    icon: "rmucsc-icon group-skill",
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
            incrementParameter: ComplementarySkillsApp.#incrementParameter,
            decrementParameter: ComplementarySkillsApp.#decrementParameter,
            rollEndurance: ComplementarySkillsApp.#rollEndurance,
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
                token: token,
                enabled: true,
                leadershipRanks: leadershipRanks,
                attributes: attributes,
                allSkills: skillsWithRanks,
                allSkillsGrouped: RMUSkillParser.groupSkills(skillsWithRanks),
            });

            if (!this.calcState.ritualParticipantData[id]) {
                this.calcState.ritualParticipantData[id] = this.#getDefaultRitualData();
            }
        }

        this._enforceDeterministicLeader();
        this._enforceDeterministicPrimaryCaster();
        this.#updateEnduranceGrid();
        this._isHydrating = false;
    }

    #getDefaultRitualData() {
        return {
            role: "minor",
            ritualSkillUuid: null,
            additionalSkillUuid: null,
            ppContributed: 0,
            bloodDice: 0,
            bloodCrit: 0,
        };
    }

    _enforceDeterministicLeader() {
        const enabledParticipants = Array.from(this.participants.values()).filter((p) => p.enabled);
        if (enabledParticipants.length === 0) return;

        const bestLeader = enabledParticipants.reduce((prev, current) => {
            if (current.leadershipRanks > prev.leadershipRanks) return current;
            if (current.leadershipRanks === prev.leadershipRanks) {
                return current.id.localeCompare(prev.id) > 0 ? current : prev;
            }
            return prev;
        }, enabledParticipants[0]);

        if (!this.calcState.leaderId || !this.participants.get(this.calcState.leaderId)?.enabled) {
            this.calcState.leaderId = bestLeader.id;
        }
    }

    _enforceDeterministicPrimaryCaster() {
        const enabledParticipants = Array.from(this.participants.values()).filter((p) => p.enabled);
        if (enabledParticipants.length === 0) return;

        const primaries = enabledParticipants.filter((p) => this.calcState.ritualParticipantData[p.id]?.role === "primary");

        if (primaries.length === 1) return;

        const pool = primaries.length > 1 ? primaries : enabledParticipants;
        const bestCandidate = pool.reduce((prev, current) => {
            if (current.attributes.level > prev.attributes.level) return current;
            if (current.attributes.level === prev.attributes.level) {
                return current.id.localeCompare(prev.id) > 0 ? current : prev;
            }
            return prev;
        }, pool[0]);

        for (const p of enabledParticipants) {
            const data = this.calcState.ritualParticipantData[p.id];
            if (p.id === bestCandidate.id) {
                data.role = "primary";
            } else if (data.role === "primary") {
                data.role = "major";
            }
        }
    }

    /* ----------------------------------------- */
    /* Endurance Workflow Logic                  */
    /* ----------------------------------------- */

    /**
     * Rebuilds the endurance grid structure based on the current time and participants.
     * Preserves already-rolled results if the grid shrinks or grows.
     */
    #updateEnduranceGrid() {
        const selectedTimeValue = this.calcState.ritualState.investingTime;

        // Dynamically accumulate objects containing time, difficulty, and localisation keys
        const requiredRolls = [];
        for (const option of RITUAL_OPTIONS.investingTime) {
            if (option.endurance && option.endurance.length > 0) {
                // We assume one roll is added per time step based on the config structure
                requiredRolls.push({
                    timeLabel: option.label,
                    difficulty: option.endurance[0],
                    difficultyLabel: option.enduranceLabel,
                });
            }
            if (option.value === selectedTimeValue) break;
        }

        const oldGrid = this.calcState.ritualState.enduranceGrid;

        const activeParticipants = Array.from(this.participants.values())
            .filter((p) => p.enabled && ["primary", "major"].includes(this.calcState.ritualParticipantData[p.id].role))
            .sort((a, b) => {
                const roleA = this.calcState.ritualParticipantData[a.id].role;
                const roleB = this.calcState.ritualParticipantData[b.id].role;
                if (roleA === "primary" && roleB !== "primary") return -1;
                if (roleA !== "primary" && roleB === "primary") return 1;
                return a.name.localeCompare(b.name);
            });

        if (requiredRolls.length === 0 || activeParticipants.length === 0) {
            this.calcState.ritualState.enduranceGrid = [];
            this.calcState.ritualState.enduranceHeaders = [];
            this.calcState.ritualState.enduranceColumns = 0;
            this.calcState.ritualState.endurancePending = false;
            return;
        }

        const newGrid = activeParticipants.map((p) => {
            const oldRow = oldGrid.find((row) => row.participantId === p.id);
            const role = this.calcState.ritualParticipantData[p.id].role;
            const failed = oldRow ? oldRow.failed : false;
            const roleOption = RITUAL_OPTIONS.roles.find((r) => r.value === role);
            const roleLabel = roleOption ? roleOption.label : role;

            const rolls = requiredRolls.map((rollDef, index) => {
                const oldRoll = oldRow?.rolls[index];
                return {
                    difficulty: rollDef.difficulty,
                    difficultyLabel: rollDef.difficultyLabel,
                    state: oldRoll ? oldRoll.state : "locked",
                    result: oldRoll ? oldRoll.result : null,
                };
            });

            return { participantId: p.id, name: p.name, role, roleLabel, failed, rolls };
        });

        this.calcState.ritualState.enduranceGrid = newGrid;
        this.calcState.ritualState.enduranceHeaders = requiredRolls.map((r) => r.timeLabel);
        this.calcState.ritualState.enduranceColumns = requiredRolls.length;

        this.#refreshEnduranceLocks();
    }

    /**
     * Sweeps the grid down the columns, then across the rows, to find the
     * next logical action and lock/unlock buttons accordingly.
     */
    #refreshEnduranceLocks() {
        const grid = this.calcState.ritualState.enduranceGrid;
        const numCols = this.calcState.ritualState.enduranceColumns;
        const numRows = grid.length;
        let nextRollFound = false;
        let pending = false;

        this.calcState.ritualState.endurancePrimaryFailed = grid.some((r) => r.role === "primary" && r.failed);

        for (let col = 0; col < numCols; col++) {
            for (let row = 0; row < numRows; row++) {
                const cell = grid[row].rolls[col];

                if (cell.state === "rolled") continue; // Already processed

                // If the Primary Caster has failed, lock everything remaining
                if (this.calcState.ritualState.endurancePrimaryFailed) {
                    cell.state = "locked";
                    continue;
                }

                // If this specific participant has already failed a previous check, lock their subsequent checks
                if (grid[row].failed) {
                    cell.state = "locked";
                    continue;
                }

                // The first unrolled, valid cell we find is the active one
                if (nextRollFound) {
                    cell.state = "locked";
                    pending = true;
                } else {
                    cell.state = "ready";
                    nextRollFound = true;
                    pending = true;
                }
            }
        }

        this.calcState.ritualState.endurancePending = pending;
    }

    static async #rollEndurance(event, target) {
        const participantId = target.dataset.participantId;
        const rollIndex = Number.parseInt(target.dataset.rollIndex, 10);

        const participant = this.participants.get(participantId);
        const gridRow = this.calcState.ritualState.enduranceGrid.find((r) => r.participantId === participantId);
        const cell = gridRow.rolls[rollIndex];

        if (!participant?.token) return;

        // Ensure we disable the grid momentarily while the API handles the roll
        cell.state = "locked";
        this.render({ parts: ["ritual"] });

        try {
            // Await the API execution with the dialog bypass
            const result = await game.system.api.rmuMacroSkillAction(participant.token, "Endurance", "", { prompt: false });

            if (result) {
                cell.state = "rolled";
                cell.result = result.decision; // e.g., "Success", "Absolute Failure"

                if (!result.decision.includes("Success")) {
                    gridRow.failed = true;
                }
            } else {
                // Failsafe if the API aborts or returns null
                cell.state = "ready";
            }
        } catch (error) {
            console.error("RMU Complementary Skills | Error executing Endurance API:", error);
            cell.state = "ready"; // Unlock on error so the GM is not permanently stuck
        }

        this.#refreshEnduranceLocks();
        this.render({ parts: ["ritual"] });
    }

    /* ----------------------------------------- */
    /* Context Preparation                       */
    /* ----------------------------------------- */

    async _prepareContext(options) {
        await this._hydrateParticipants();
        return {
            activeTab: this.calcState.activeTab,
            sidePanelOpen: this.calcState.sidePanelOpen,
        };
    }

    async _preparePartContext(partId, context, options) {
        if (partId === "sidePanel") {
            const allTokens = canvas.tokens.placeables;
            const availableTokens = allTokens.filter((t) => t.actor && VALID_ACTOR_TYPES.includes(t.actor.type) && !this.tokenIds.has(t.id));
            return { ...context, availableTokens };
        }

        if (partId === "boost") {
            const participants = Array.from(this.participants.values()).filter((p) => p.enabled);
            if (participants.length === 0) return { ...context, participants: [] };

            if (!this.calcState.primaryActorId || !this.participants.get(this.calcState.primaryActorId)?.enabled) {
                this.calcState.primaryActorId = participants[0]?.id || null;
                this.calcState.primarySkillUuid = null;
                this.calcState.primarySkillName = null;
                this.calcState.primaryActorSkills = [];
            }

            const primaryActor = this.participants.get(this.calcState.primaryActorId);

            const allPrimarySkills = primaryActor?.actor
                ? RMUSkillParser._getAllActorSkills(primaryActor.actor)
                      .map(RMUSkillParser.getSkillData)
                      .filter((sk) => !sk.disabledBySystem)
                      .sort(RMUSkillParser.sortSkills)
                : [];

            for (const p of this.participants.values()) {
                const pSkills = p.actor ? RMUSkillParser._getAllActorSkills(p.actor).map(RMUSkillParser.getSkillData) : [];
                const skill = pSkills.find((s) => s.name === this.calcState.primarySkillName);
                p.bonusForSelectedSkill = skill ? skill.bonus : 0;
            }

            return {
                ...context,
                detailsState: this.calcState.detailsState,
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
            if (!this.participants.get(this.calcState.leaderId)?.enabled) {
                this._enforceDeterministicLeader();
            }

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
            const ritualParticipants = Array.from(this.participants.values()).map((p) => {
                const ritualSkills = p.allSkills.filter((sk) => {
                    const search = (sk.name + " " + sk.category).toLowerCase();
                    return search.includes("magical ritual");
                });

                const ritualData = foundry.utils.deepClone(this.calcState.ritualParticipantData[p.id]);

                // If a Major participant has failed their endurance roll,
                // silently strip their skill inputs before sending them to the calculator.
                const gridData = this.calcState.ritualState.enduranceGrid.find((row) => row.participantId === p.id);
                if (gridData?.failed) {
                    ritualData.ritualSkillUuid = null;
                    ritualData.additionalSkillUuid = null;
                }

                return {
                    ...p,
                    maxPP: p.attributes.currentPP,
                    ritualData: ritualData,
                    ritualSkillsGrouped: RMUSkillParser.groupSkills(ritualSkills),
                    canInvestBlood: p.enabled && ritualData.role !== "minor",
                };
            });

            const enabledParticipants = ritualParticipants.filter((p) => p.enabled);
            const calculation = RitualCalculator.calculateTotalRitualBonus(this.calcState.ritualState, enabledParticipants);

            const filteredDurationSteps = RITUAL_OPTIONS.durationSteps.filter((step) => step.value >= this.calcState.ritualState.paramDurBase);

            return {
                ...context,
                targetSpells: this.calcState.ritualState.targetSpells,
                ritualParticipants: ritualParticipants,
                ritualOptions: RITUAL_OPTIONS,
                filteredDurationSteps: filteredDurationSteps,
                ritualState: this.calcState.ritualState,
                calculation: calculation,
            };
        }

        return context;
    }

    _onRender(context, options) {
        super._onRender(context, options);
        const rtlLanguages = ["ar", "he", "fa", "ur"];
        if (rtlLanguages.includes(game.i18n.lang)) {
            this.element.setAttribute("dir", "rtl");
            this.element.classList.add("rtl");
        }
    }

    /* ----------------------------------------- */
    /* Action Handlers                           */
    /* ----------------------------------------- */

    static #toggleSidePanel(event, target) {
        this.calcState.sidePanelOpen = !this.calcState.sidePanelOpen;

        if (typeof this.position.width === "number") {
            const panelWidthPx = 300;
            const isRTL = this.element.classList.contains("rtl");

            let newWidth = this.position.width;
            let newLeft = this.position.left;

            if (this.calcState.sidePanelOpen) {
                newWidth += panelWidthPx;
                if (isRTL && newLeft !== null) newLeft -= panelWidthPx;
            } else {
                newWidth -= panelWidthPx;
                if (isRTL && newLeft !== null) newLeft += panelWidthPx;
            }

            this.setPosition({ width: newWidth, left: newLeft });
        }

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
        if (this.calcState.ritualState.targetSpells.length <= 1) return;
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
        this.#updateEnduranceGrid();
        this.render({ force: true });
    }

    static #incrementParameter(event, target) {
        const paramName = target.dataset.target;
        this.calcState.ritualState[paramName]++;
        this.render({ parts: ["ritual"] });
    }

    static #decrementParameter(event, target) {
        const paramName = target.dataset.target;
        if (this.calcState.ritualState[paramName] > 0) {
            this.calcState.ritualState[paramName]--;
            this.render({ parts: ["ritual"] });
        }
    }

    _attachPartListeners(partId, htmlElement, options) {
        super._attachPartListeners(partId, htmlElement, options);
        const $html = $(htmlElement);

        if (partId === "tabs") {
            $html.find(".item").on("click", (ev) => {
                this.calcState.activeTab = ev.currentTarget.dataset.tab;
                $html.find(".item").removeClass("active");
                $(ev.currentTarget).addClass("active");

                $(this.element).find(".rmucsc-tab-content").removeClass("active");
                $(this.element).find(`.rmucsc-tab-content[data-tab="${this.calcState.activeTab}"]`).addClass("active");

                this.setPosition({ height: "auto" });
            });
        }

        if (partId === "boost") {
            $html.find(".rmucsc-participant-enable").on("change", (e) => {
                const participant = this.participants.get(e.currentTarget.dataset.id);
                if (participant) participant.enabled = e.currentTarget.checked;
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmucsc-primary-actor-select").on("change", (e) => {
                this.calcState.primaryActorId = e.currentTarget.value;
                this.calcState.primarySkillUuid = null;
                this.calcState.primarySkillName = null;
                this.calcState.primaryActorSkills = [];
                this.calcState.otherActorSkills = {};
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmucsc-primary-skill-select").on("change", (e) => {
                const uuid = e.currentTarget.value;
                const primaryActor = this.participants.get(this.calcState.primaryActorId);
                const allSkills = primaryActor?.actor ? RMUSkillParser._getAllActorSkills(primaryActor.actor).map(RMUSkillParser.getSkillData) : [];
                const skillData = allSkills.find((s) => s.uuid === uuid);

                this.calcState.primarySkillUuid = uuid;
                this.calcState.primarySkillName = skillData ? skillData.name : null;
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmucsc-primary-comp-add").on("click", () => {
                this.calcState.primaryActorSkills.push({ name: null, ranks: 0 });
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmucsc-primary-comp-skill").on("change", (e) => {
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

            $html.find(".rmucsc-primary-comp-delete").on("click", (e) => {
                const index = e.currentTarget.dataset.index;
                this.calcState.primaryActorSkills.splice(index, 1);
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmucsc-other-comp-skill").on("change", (e) => {
                const actorId = e.currentTarget.dataset.id;
                this.calcState.otherActorSkills[actorId] = e.currentTarget.value;
                this.render({ parts: ["boost"] });
            });

            $html.find(".rmucsc-send-chat").on("click", this.#onSendBoostToChat.bind(this));
            htmlElement.addEventListener("toggle", (e) => this.#onDetailsToggle(e, this.calcState.detailsState), true);
        }

        if (partId === "group") {
            $html.find(".rmucsc-participant-enable").on("change", (e) => {
                const participant = this.participants.get(e.currentTarget.dataset.id);
                if (participant) participant.enabled = e.currentTarget.checked;
                this.render({ parts: ["group"] });
            });

            $html.find(".rmucsc-leader-select").on("change", (e) => {
                this.calcState.leaderId = e.currentTarget.value;
                this.render({ parts: ["group"] });
            });

            $html.find(".rmucsc-task-skill-select").on("change", (e) => {
                const select = e.currentTarget;
                this.calcState.taskSkillUuid = select.value;
                this.calcState.taskSkillName = select.options[select.selectedIndex].text.trim();
                this.render({ parts: ["group"] });
            });

            $html.find(".rmucsc-send-chat").on("click", this.#onSendGroupToChat.bind(this));
        }

        if (partId === "ritual") {
            htmlElement.addEventListener("change", this.#onRitualTabChange.bind(this));
            htmlElement.addEventListener("toggle", (e) => this.#onDetailsToggle(e, this.calcState.ritualState.detailsState), true);
            $html.find(".rmucsc-send-chat").on("click", this.#onSendRitualToChat.bind(this));
        }
    }

    #onRitualTabChange(event) {
        const target = event.target;
        const ritualState = this.calcState.ritualState;
        const pData = this.calcState.ritualParticipantData;
        const id = target.dataset.id;

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

            if (target.name === "paramDurBase" && ritualState.paramDurTarget < ritualState.paramDurBase) {
                ritualState.paramDurTarget = ritualState.paramDurBase;
            }

            if (target.name === "investingTime") {
                this.#updateEnduranceGrid();
            }

            return this.render({ parts: ["ritual"] });
        }

        const checkboxNames = ["paramDecreaseAoE", "paramDurNoToRound", "paramDurConcToRndLvl", "paramDurRemoveConc"];
        if (checkboxNames.includes(target.name)) {
            ritualState[target.name] = target.checked;
            return this.render({ parts: ["ritual"] });
        }

        const circumstanceNames = ["auspiciousTime", "auspiciousLocation", "auspiciousProphecy", "inauspiciousTime", "inauspiciousLocation", "inauspiciousProphecy"];
        if (circumstanceNames.includes(target.name)) {
            let val = Number.parseInt(target.value, 10) || 0;
            const isAuspicious = target.name.startsWith("auspicious");

            const min = isAuspicious ? 0 : -25;
            const max = isAuspicious ? 25 : 0;

            if (val > max) val = max;
            if (val < min) val = min;

            ritualState[target.name] = val;
            target.value = val;
            return this.render({ parts: ["ritual"] });
        }

        if (target.classList.contains("rmucsc-spell-level")) {
            const spell = ritualState.targetSpells.find((s) => s.id === id);
            if (spell) {
                spell.level = Number.parseInt(target.value, 10) || 1;
                this.#updateRitualTotals();
            }
            return this.render({ parts: ["ritual"] });
        }
        if (target.classList.contains("rmucsc-spell-type")) {
            const spell = ritualState.targetSpells.find((s) => s.id === id);
            if (spell) spell.listType = Number.parseInt(target.value, 10) || 0;
            return this.render({ parts: ["ritual"] });
        }
        if (target.classList.contains("rmucsc-spell-knowledge")) {
            const spell = ritualState.targetSpells.find((s) => s.id === id);
            if (spell) spell.listKnowledge = Number.parseInt(target.value, 10) || 0;
            return this.render({ parts: ["ritual"] });
        }

        if (target.classList.contains("rmucsc-participant-enable")) {
            const participant = this.participants.get(id);
            if (participant) participant.enabled = target.checked;
            this._enforceDeterministicPrimaryCaster();
            this.#updateEnduranceGrid();
            return this.render({ parts: ["ritual"] });
        }

        if (target.classList.contains("rmucsc-ritual-role-select")) {
            const newRole = target.value;

            if (newRole === "primary") {
                for (const [pId, data] of Object.entries(pData)) {
                    if (pId !== id && data.role === "primary") data.role = "major";
                }
            }

            if (newRole === "minor") {
                pData[id].bloodDice = 0;
                pData[id].bloodCrit = 0;
            }

            pData[id].role = newRole;
            this._enforceDeterministicPrimaryCaster();
            this.#updateEnduranceGrid();
            return this.render({ parts: ["ritual"] });
        }

        if (target.classList.contains("rmucsc-ritual-skill-select")) {
            pData[id].ritualSkillUuid = target.value;
            return this.render({ parts: ["ritual"] });
        }
        if (target.classList.contains("rmucsc-ritual-additional-select")) {
            pData[id].additionalSkillUuid = target.value;
            return this.render({ parts: ["ritual"] });
        }

        if (target.classList.contains("rmucsc-ritual-pp-input")) {
            const participant = this.participants.get(id);
            const maxPP = participant ? participant.attributes.currentPP : 0;
            let val = Number.parseInt(target.value, 10) || 0;

            if (val > maxPP) val = maxPP;
            if (val < 0) val = 0;

            pData[id].ppContributed = val;
            target.value = val;
            return this.render({ parts: ["ritual"] });
        }

        if (target.classList.contains("rmucsc-ritual-hits-select")) {
            pData[id].bloodDice = Number.parseInt(target.value, 10) || 0;
            return this.render({ parts: ["ritual"] });
        }
        if (target.classList.contains("rmucsc-ritual-crit-select")) {
            pData[id].bloodCrit = Number.parseInt(target.value, 10) || 0;
            return this.render({ parts: ["ritual"] });
        }
    }

    #onDetailsToggle(event, stateTarget) {
        const target = event.target;
        if (target.tagName === "DETAILS" && target.dataset.section) {
            stateTarget[target.dataset.section] = target.open;
        }
    }

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
