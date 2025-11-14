import { BaseCalculatorApp } from "./BaseCalculatorApp.js";
import { RMUSkillParser } from "../utils/RMUSkillParser.js";

/**
 * An application for calculating the total bonus for a group task (Rule 2),
 * factoring in participant skills and leadership.
 * @extends {BaseCalculatorApp}
 */
export class GroupTaskApp extends BaseCalculatorApp {
  /**
   * Initializes the application and sets up the initial state for the group task calculation.
   * @param {Array<Token>} tokens - The initial array of tokens to include in the calculator.
   * @param {object} [options={}] - Application rendering options.
   */
  constructor(tokens, options = {}) {
    super(tokens, options);

    /**
     * The internal state of the calculator, tracking the selected leader and task skill.
     * @type {object}
     */
    this.calcState = {
      leaderId: null,
      taskSkillName: null,
    };
  }

  /**
   * The title of the application window.
   * @returns {string}
   */
  static get title() {
    return "Calculate Group Task";
  }

  /**
   * The path to the Handlebars template for the application.
   * @returns {string}
   */
  static get template() {
    return "modules/rmu-complementary-skills/templates/group-task-app.hbs";
  }

  /**
   * Prepares the data context for rendering, setting a default leader if not already chosen.
   * @param {object} options - Context preparation options.
   * @returns {Promise<object>} The context object for the Handlebars template.
   * @override
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Set the default leader if one is available and not already set.
    if (this._defaultLeaderId && !this.calcState.leaderId) {
      this.calcState.leaderId = this._defaultLeaderId;
    }

    return context;
  }

  /**
   * Prepares the UI-specific context for the Group Task application.
   * @param {object} options - Context preparation options.
   * @returns {Promise<object>} The UI context object.
   * @override
   */
  async getSpecificUiContext(options) {
    const participants = this.getEnabledParticipants();

    // If the current leader is disabled, select a new one.
    if (!this.participants.get(this.calcState.leaderId)?.enabled) {
      this.calcState.leaderId =
        participants.find((p) => p.leadershipRanks > 0)?.id ||
        participants[0]?.id ||
        null;
    }

    // Create a unified list of all available skills from all participants.
    const skillMap = new Map();
    for (const p of this.participants.values()) {
      const allSkills = p.actor.system._skills
        .map(RMUSkillParser.getSkillData)
        .filter((sk) => !sk.disabledBySystem);
      for (const skill of allSkills) {
        skillMap.set(skill.name, skill);
      }
    }

    const allSkillOptionsFlat = Array.from(skillMap.values()).sort(
      RMUSkillParser.sortSkills
    );

    const allSkillOptionsGrouped =
      RMUSkillParser.groupSkills(allSkillOptionsFlat);

    const selectedSkillName = this.calcState.taskSkillName;

    // For each participant, find their bonus for the selected task skill.
    for (const p of this.participants.values()) {
      const allSkills = p.actor.system._skills.map(RMUSkillParser.getSkillData);
      const skill = allSkills.find((s) => s.name === selectedSkillName);
      p.bonusForSelectedSkill = skill ? skill.bonus : 0;
    }

    const calculation = this._calculateBonus();

    return {
      participants: Array.from(this.participants.values()),
      leaderId: this.calcState.leaderId,
      allSkillOptions: allSkillOptionsGrouped,
      taskSkillName: this.calcState.taskSkillName,
      calculation: calculation,
    };
  }

  /**
   * Attaches event listeners specific to the Group Task application.
   * @param {jQuery} $content - The jQuery object for the content element.
   * @override
   */
  attachSubclassListeners($content) {
    $content
      .find(".rmu-leader-select")
      .on("change", this._onChangeLeader.bind(this));
    $content
      .find(".rmu-task-skill-select")
      .on("change", this._onChangeTaskSkill.bind(this));
    $content
      .find(".rmu-send-chat")
      .on("click", this._onSendToChat.bind(this));
  }

  /**
   * Handles changing the group leader.
   * @param {Event} event - The change event.
   * @private
   */
  _onChangeLeader(event) {
    this.calcState.leaderId = event.currentTarget.value;
    this.render();
  }

  /**
   * Handles changing the task skill.
   * @param {Event} event - The change event.
   * @private
   */
  _onChangeTaskSkill(event) {
    this.calcState.taskSkillName = event.currentTarget.value;
    this.render();
  }

  /**
   * Sends the calculated group task bonus to the chat.
   * @param {Event} event - The click event.
   * @private
   */
  async _onSendToChat(event) {
    const calc = this._calculateBonus();
    if (!calc.taskSkillName) {
      ui.notifications.warn("Please select a Task Skill first.");
      return;
    }

    const templateData = {
      taskSkillName: calc.taskSkillName,
      participants: calc.participants,
      averageBonus: calc.averageBonus,
      leaderName: calc.leaderName,
      leadershipBonus: calc.leadershipBonus,
      total: calc.total,
    };

    // Get all enabled participants in the calculation
    const participants = this.getEnabledParticipants();

    // Get all User IDs that own these participants' actors
    const ownerIds = [];
    for (const p of participants) {
      if (!p.actor) continue;
      for (const [userId, level] of Object.entries(p.actor.ownership)) {
        // Add user if they have OWNER level
        if (level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
          ownerIds.push(userId);
        }
      }
    }
    // Get all GM users
    const gmUsers = ChatMessage.getWhisperRecipients("GM");
    // Combine and deduplicate
    const allRecipients = Array.from(new Set([...ownerIds, ...gmUsers]));

    // Use the V13 ApplicationV2 method to guarantee a string
    const content = await foundry.applications.handlebars.renderTemplate(
      "modules/rmu-complementary-skills/templates/chat-group-task.hbs",
      templateData
    );

    ChatMessage.create({
      user: game.user.id,
      content: content,
      whisper: allRecipients,
      flags: { "rmu-complementary-skills": { isCalc: true } },
    });
  }

  /**
   * Calculates the total bonus for the group task.
   * @returns {object} An object containing the bonus breakdown.
   * @private
   */
  _calculateBonus() {
    const participants = this.getEnabledParticipants();
    if (participants.length === 0) return {};

    let totalBonus = 0;
    const participantBonuses = [];

    // Sum the bonuses from all enabled participants for the selected skill.
    for (const p of participants) {
      const bonus = p.bonusForSelectedSkill || 0;
      totalBonus += bonus;
      participantBonuses.push({ name: p.name, bonus: bonus });
    }

    const averageBonus =
      participants.length > 0 ? totalBonus / participants.length : 0;

    // Get the leadership bonus from the selected leader.
    const leader = this.participants.get(this.calcState.leaderId);
    const leadershipBonus =
      leader && leader.enabled ? leader.leadershipRanks : 0;

    return {
      taskSkillName: this.calcState.taskSkillName,
      participants: participantBonuses,
      averageBonus: Math.round(averageBonus),
      leadershipBonus: leadershipBonus,
      leaderName: leader?.name || "None",
      total: Math.round(averageBonus) + leadershipBonus,
    };
  }
}