import { BaseCalculatorApp } from "./BaseCalculatorApp.js";
import { RMUSkillParser } from "../utils/RMUSkillParser.js";

/**
 * An application for calculating the total bonus for a "Boost Skill" check (Rule 1),
 * factoring in a primary actor and complementary skills from helpers.
 * @extends {BaseCalculatorApp}
 */
export class BoostSkillApp extends BaseCalculatorApp {
  /**
   * Initializes the application and sets up the initial state for the boost skill calculation.
   * @param {Array<Token>} tokens - The initial array of tokens to include in the calculator.
   * @param {object} [options={}] - Application rendering options.
   */
  constructor(tokens, options = {}) {
    super(tokens, options);
    /**
     * The internal state of the calculator.
     * @type {object}
     */
    this.calcState = {
      primaryActorId: tokens[0]?.id || null,
      primarySkillName: null,
      primaryActorSkills: [],
      otherActorSkills: {},
    };
  }

  static get title() {
    return "Boost Skill Check";
  }
  static get template() {
    return "modules/rmu-complementary-skills/templates/boost-skill-app.hbs";
  }

  /**
   * Prepares the UI-specific context for the Boost Skill application.
   * @param {object} options - Context preparation options.
   * @returns {Promise<object>} The UI context object.
   * @override
   */
  async getSpecificUiContext(options) {
    const participants = this.getEnabledParticipants();
    if (participants.length === 0) return { participants: [] };

    // If the current primary actor is disabled, reset to the first enabled one
    if (!this.participants.get(this.calcState.primaryActorId)?.enabled) {
      this.calcState.primaryActorId = participants[0]?.id || null;
      this.calcState.primarySkillName = null;
      this.calcState.primaryActorSkills = [];
    }

    const primaryActor = this.participants.get(this.calcState.primaryActorId);

    const allPrimarySkills = primaryActor
      ? primaryActor.actor.system._skills
          .map(RMUSkillParser.getSkillData)
          .filter((sk) => !sk.disabledBySystem)
          .sort(RMUSkillParser.sortSkills)
      : [];

    const primarySkillOptionsGrouped =
      RMUSkillParser.groupSkills(allPrimarySkills);
    const selectedSkillName = this.calcState.primarySkillName;

    // Find the bonus for the selected skill for all participants (for display)
    for (const p of this.participants.values()) {
      const allSkills = p.actor.system._skills.map(RMUSkillParser.getSkillData);
      const skill = allSkills.find((s) => s.name === selectedSkillName);
      p.bonusForSelectedSkill = skill ? skill.bonus : 0;
    }

    const primaryComplementOptions = RMUSkillParser.groupSkills(
      primaryActor ? primaryActor.allSkills : []
    );
    const otherParticipants = participants.filter(
      (p) => p.id !== this.calcState.primaryActorId
    );
    const calculation = this._calculateBonus(allPrimarySkills);

    return {
      participants: Array.from(this.participants.values()),
      primaryActorId: this.calcState.primaryActorId,
      primarySkillOptions: primarySkillOptionsGrouped,
      primarySkillName: this.calcState.primarySkillName,
      primaryComplementOptions: primaryComplementOptions,
      primaryActorSkills: this.calcState.primaryActorSkills,
      otherParticipants: otherParticipants,
      otherActorSkills: this.calcState.otherActorSkills,
      calculation: calculation,
    };
  }

  /**
   * Attaches event listeners specific to the Boost Skill application.
   * @param {jQuery} $content - The jQuery object for the content element.
   * @override
   */
  attachSubclassListeners($content) {
    $content
      .find(".rmu-primary-actor-select")
      .on("change", this._onChangePrimaryActor.bind(this));
    $content
      .find(".rmu-primary-skill-select")
      .on("change", this._onChangePrimarySkill.bind(this));
    $content
      .find(".rmu-primary-comp-add")
      .on("click", this._onAddPrimaryComp.bind(this));
    $content
      .find(".rmu-primary-comp-skill")
      .on("change", this._onChangePrimaryComp.bind(this));
    $content
      .find(".rmu-primary-comp-delete")
      .on("click", this._onDeletePrimaryComp.bind(this));
    $content
      .find(".rmu-other-comp-skill")
      .on("change", this._onChangeOtherComp.bind(this));
    $content
      .find(".rmu-send-chat")
      .on("click", this._onSendToChat.bind(this));
  }

  /**
   * Handles changing the primary actor.
   * @param {Event} event - The change event.
   * @private
   */
  _onChangePrimaryActor(event) {
    this.calcState.primaryActorId = event.currentTarget.value;
    this.calcState.primarySkillName = null;
    this.calcState.primaryActorSkills = [];
    this.calcState.otherActorSkills = {};
    this.render();
  }

  /**
   * Handles changing the primary skill.
   * @param {Event} event - The change event.
   * @private
   */
  _onChangePrimarySkill(event) {
    this.calcState.primarySkillName = event.currentTarget.value;
    this.render();
  }

  /**
   * Handles adding a new complementary skill row for the primary actor.
   * @param {Event} event - The click event.
   * @private
   */
  _onAddPrimaryComp(event) {
    this.calcState.primaryActorSkills.push({ name: null, ranks: 0 });
    this.render();
  }

  /**
   * Handles changing a complementary skill for the primary actor.
   * @param {Event} event - The change event.
   * @private
   */
  _onChangePrimaryComp(event) {
    const index = event.currentTarget.dataset.index;
    const skillName = event.currentTarget.value;
    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    const skillData = primaryActor?.allSkills.find((s) => s.name === skillName);

    this.calcState.primaryActorSkills[index] = {
      name: skillName,
      ranks: skillData?.ranks || 0,
    };
    this.render();
  }

  /**
   * Handles deleting a complementary skill row for the primary actor.
   * @param {Event} event - The click event.
   * @private
   */
  _onDeletePrimaryComp(event) {
    const index = event.currentTarget.dataset.index;
    this.calcState.primaryActorSkills.splice(index, 1);
    this.render();
  }

  /**
   * Handles changing a complementary skill for another participant.
   * @param {Event} event - The change event.
   * @private
   */
  _onChangeOtherComp(event) {
    const actorId = event.currentTarget.dataset.id;
    const skillName = event.currentTarget.value;
    this.calcState.otherActorSkills[actorId] = skillName;
    this.render();
  }

  /**
   * Sends the calculated skill boost to the chat.
   * @param {Event} event - The click event.
   * @private
   */
  async _onSendToChat(event) {
    const primaryActor = this.participants.get(this.calcState.primaryActorId);

    const allPrimarySkills = primaryActor
      ? primaryActor.actor.system._skills
          .map(RMUSkillParser.getSkillData)
          .filter((sk) => !sk.disabledBySystem)
          .sort(RMUSkillParser.sortSkills)
      : [];

    const calc = this._calculateBonus(allPrimarySkills);

    if (!calc.primaryBonus) {
      ui.notifications.warn("Please select a Primary Skill first.");
      return;
    }

    const templateData = {
      primaryActorName: primaryActor.name,
      primarySkillName: this.calcState.primarySkillName,
      primaryBonus: calc.primaryBonus,
      breakdown: calc.breakdown,
      complementBonus: calc.complementBonus,
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
      "modules/rmu-complementary-skills/templates/chat-boost-skill.hbs",
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
   * Calculates the total bonus for the skill boost.
   * @param {Array<object>} allPrimarySkills - The pre-processed skills for the primary actor.
   * @returns {object} An object containing the bonus breakdown.
   * @private
   */
  _calculateBonus(allPrimarySkills) {
    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    if (!primaryActor) return {};

    const primarySkill = (
      allPrimarySkills ||
      primaryActor.actor.system._skills.map(RMUSkillParser.getSkillData)
    ).find((s) => s.name === this.calcState.primarySkillName);
    const primaryBonus = primarySkill?.bonus || 0;

    let complementRanks = [];

    // Add complementary ranks from the primary actor
    for (const skill of this.calcState.primaryActorSkills) {
      if (skill.ranks > 0) {
        complementRanks.push({
          name: `${primaryActor.name}'s ${skill.name}`,
          ranks: skill.ranks,
        });
      }
    }

    // Add complementary ranks from other participants
    for (const [actorId, skillName] of Object.entries(
      this.calcState.otherActorSkills
    )) {
      const participant = this.participants.get(actorId);
      if (participant && participant.enabled && skillName) {
        const skillData = participant.allSkills.find(
          (s) => s.name === skillName
        );
        if (skillData && skillData.ranks > 0) {
          complementRanks.push({
            name: `${participant.name}'s ${skillName}`,
            ranks: skillData.ranks,
          });
        }
      }
    }

    // Sort by ranks, descending, for diminishing returns
    complementRanks.sort((a, b) => b.ranks - a.ranks);

    let complementBonus = 0;
    const breakdown = [];

    // Apply diminishing returns calculation
    complementRanks.forEach((item, index) => {
      let bonus = 0;
      if (index === 0) {
        bonus = item.ranks;
      } else {
        bonus = Math.floor(item.ranks / 2 ** index);
      }
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