import { BaseCalculatorApp } from "./BaseCalculatorApp.js";
import { RmuSkillParser } from "../utils/RmuSkillParser.js";

/**
 * An application for calculating the bonus for a skill check boosted by complementary skills from multiple actors.
 * @extends {BaseCalculatorApp}
 */
export class BoostSkillApp extends BaseCalculatorApp {
  /**
   * Initializes the application and sets up the initial state for the calculation.
   * @param {Array<Token>} tokens - The initial array of tokens to include in the calculator.
   * @param {object} [options={}] - Application rendering options.
   */
  constructor(tokens, options = {}) {
    super(tokens, options);

    /**
     * The internal state of the calculator, tracking selected actors, skills, and bonuses.
     * @type {object}
     */
    this.calcState = {
      primaryActorId: tokens[0]?.id || null,
      primarySkillName: null,
      primaryActorSkills: [],
      otherActorSkills: {},
    };
  }

  /**
   * The title of the application window.
   * @returns {string}
   */
  static get title() { return "Boost Skill Check"; }

  /**
   * The path to the Handlebars template for the application.
   * @returns {string}
   */
  static get template() { return "modules/rmu-complementary-skills/templates/boost-skill-app.hbs"; }
  
  /**
   * Prepares the UI-specific context for rendering the Boost Skill application.
   * @param {object} options - Context preparation options.
   * @returns {Promise<object>} The UI context object.
   * @override
   */
  async getSpecificUiContext(options) {
    const participants = this.getEnabledParticipants();
    if (participants.length === 0) return { participants: [] };

    // Reset primary actor if they are no longer enabled.
    if (!this.participants.get(this.calcState.primaryActorId)?.enabled) {
      this.calcState.primaryActorId = participants[0]?.id || null;
      this.calcState.primarySkillName = null;
      this.calcState.primaryActorSkills = [];
    }

    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    
    // Get the list of skills for the primary actor's dropdown.
    const allPrimarySkills = primaryActor ? 
      primaryActor.actor.system._skills
        .map(RmuSkillParser.getSkillData)
        .filter(sk => !sk.disabledBySystem)
        .sort(RmuSkillParser.sortSkills)
      : [];
    
    // --- NEW ---
    const primarySkillOptionsGrouped = RmuSkillParser.groupSkills(allPrimarySkills);
    // --- END ---
    
    const selectedSkillName = this.calcState.primarySkillName;
    
    // Update the bonus for the selected primary skill for all participants.
    for (const p of this.participants.values()) {
      const allSkills = p.actor.system._skills.map(RmuSkillParser.getSkillData);
      const skill = allSkills.find(s => s.name === selectedSkillName);
      p.bonusForSelectedSkill = skill ? skill.bonus : 0;
    }
    
    // --- UPDATE ---
    // Group the complementary skill options as well
    const primaryComplementOptions = RmuSkillParser.groupSkills(primaryActor ? primaryActor.allSkills : []);
    // --- END ---
    
    const otherParticipants = participants.filter(p => p.id !== this.calcState.primaryActorId);
    
    // --- UPDATE ---
    const calculation = this._calculateBonus(allPrimarySkills); // Pass flat list
    // --- END ---

    return {
      participants: Array.from(this.participants.values()),
      primaryActorId: this.calcState.primaryActorId,
      primarySkillOptions: primarySkillOptionsGrouped, // Pass grouped data
      primarySkillName: this.calcState.primarySkillName,
      primaryComplementOptions: primaryComplementOptions, // Pass grouped data
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
    $content.find(".rmu-primary-actor-select").on("change", this._onChangePrimaryActor.bind(this));
    $content.find(".rmu-primary-skill-select").on("change", this._onChangePrimarySkill.bind(this));
    $content.find(".rmu-primary-comp-add").on("click", this._onAddPrimaryComp.bind(this));
    $content.find(".rmu-primary-comp-skill").on("change", this._onChangePrimaryComp.bind(this));
    $content.find(".rmu-primary-comp-delete").on("click", this._onDeletePrimaryComp.bind(this));
    $content.find(".rmu-other-comp-skill").on("change", this._onChangeOtherComp.bind(this));
    $content.closest(".window-app").find(".rmu-send-chat").on("click", this._onSendToChat.bind(this));
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
   * Handles adding a new complementary skill for the primary actor.
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
    const skillData = primaryActor?.allSkills.find(s => s.name === skillName);
    
    this.calcState.primaryActorSkills[index] = {
      name: skillName,
      ranks: skillData?.ranks || 0,
    };
    this.render();
  }
  
  /**
   * Handles deleting a complementary skill for the primary actor.
   * @param {Event} event - The click event.
   * @private
   */
  _onDeletePrimaryComp(event) {
    const index = event.currentTarget.dataset.index;
    this.calcState.primaryActorSkills.splice(index, 1);
    this.render();
  }
  
  /**
   * Handles changing a complementary skill for another actor.
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
   * Sends the calculated bonus to the chat.
   * @param {Event} event - The click event.
   * @private
   */
  _onSendToChat(event) {
     // --- UPDATE ---
     // Need to pass the flat list to _calculateBonus
     const primaryActor = this.participants.get(this.calcState.primaryActorId);
     const allPrimarySkills = primaryActor ? 
      primaryActor.actor.system._skills
        .map(RmuSkillParser.getSkillData)
        .filter(sk => !sk.disabledBySystem)
        .sort(RmuSkillParser.sortSkills)
      : [];
     const calc = this._calculateBonus(allPrimarySkills);
     // --- END ---
     
     if (!calc.primaryBonus) {
       ui.notifications.warn("Please select a Primary Skill first.");
       return;
     }
     
     let content = `
       <strong>Complementary Skill Check</strong>
       <p><strong>Primary Skill:</strong> ${this.calcState.primarySkillName} (<strong>+${calc.primaryBonus}</strong>)</p>
       <p><strong>Complementary Bonus: +${calc.complementBonus}</strong></p>
       <ul>
         ${calc.breakdown.map(b => `<li>+${b.bonus} (from ${b.name}, ${b.ranks} Ranks)</li>`).join("")}
       </ul>
       <hr>
       <p><strong>Total Bonus: +${calc.total}</strong></p>
     `;
     
     ChatMessage.create({
       user: game.user.id,
       content: content,
       whisper: ChatMessage.getWhisperRecipients("GM"),
     });
  }
  
  /**
   * Calculates the total skill bonus including complementary skills.
   * @param {Array<object>} [allPrimarySkills] - Pre-calculated FLAT array of skill options for the primary actor.
   * @returns {object} An object containing the bonus breakdown.
   * @private
   */
  _calculateBonus(allPrimarySkills) { //
    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    if (!primaryActor) return {};

    // 1. Get Primary Skill Bonus
    const primarySkill = (allPrimarySkills || primaryActor.actor.system._skills.map(RmuSkillParser.getSkillData)) // Use flat list
      .find(s => s.name === this.calcState.primarySkillName);
    const primaryBonus = primarySkill?.bonus || 0;

    // 2. Gather all complementary skill ranks
    let complementRanks = [];

    // 2a. From Primary Actor
    for (const skill of this.calcState.primaryActorSkills) {
      if (skill.ranks > 0) {
        complementRanks.push({ name: `${primaryActor.name}'s ${skill.name}`, ranks: skill.ranks });
      }
    }
    
    // 2b. From Other Actors
    for (const [actorId, skillName] of Object.entries(this.calcState.otherActorSkills)) {
      const participant = this.participants.get(actorId);
      if (participant && participant.enabled && skillName) {
        const skillData = participant.allSkills.find(s => s.name === skillName); // allSkills is flat list
        if (skillData && skillData.ranks > 0) {
          complementRanks.push({ name: `${participant.name}'s ${skillName}`, ranks: skillData.ranks });
        }
      }
    }

    // 3. Sort by ranks, descending
    complementRanks.sort((a, b) => b.ranks - a.ranks);

    // 4. Calculate bonus with diminishing returns
    let complementBonus = 0;
    const breakdown = [];
    
    complementRanks.forEach((item, index) => {
      let bonus = 0;
      if (index === 0) {
        bonus = item.ranks; // First skill adds full ranks
      } else {
        bonus = Math.floor(item.ranks / (2 ** index)); // 2nd is /2, 3rd is /4, etc.
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