import { BaseCalculatorApp } from "./BaseCalculatorApp.js";
import { RMUSkillParser } from "../utils/RMUSkillParser.js";

/**
 * An application for calculating the total bonus for a "Boost Skill" check (Rule 1).
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
    this.calcState = {
      primaryActorId: tokens[0]?.id || null,
      primarySkillUuid: null,
      primarySkillName: null,
      primaryActorSkills: [],
      otherActorSkills: {},
    };
  }

  static get title() { return "Boost Skill Check"; }
  static get template() { return "modules/rmu-complementary-skills/templates/boost-skill-app.hbs"; }
  
  /**
   * Prepares the UI-specific context for the Boost Skill application.
   * @param {object} options - Context preparation options.
   * @returns {Promise<object>} The UI context object.
   * @override
   */
  async getSpecificUiContext(options) {
    const participants = this.getEnabledParticipants();
    if (participants.length === 0) return { participants: [] };

    // If the current primary actor is disabled, reset
    if (!this.participants.get(this.calcState.primaryActorId)?.enabled) {
      this.calcState.primaryActorId = participants[0]?.id || null;
      this.calcState.primarySkillUuid = null;
      this.calcState.primarySkillName = null;
      this.calcState.primaryActorSkills = [];
    }

    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    
    // Get all skills (including disabled) for the primary skill dropdown
    const allPrimarySkills = primaryActor ? 
      primaryActor.actor.system._skills
        .map(RMUSkillParser.getSkillData)
        .filter(sk => !sk.disabledBySystem)
        .sort(RMUSkillParser.sortSkills)
      : [];
    
    const primarySkillOptionsGrouped = RMUSkillParser.groupSkills(allPrimarySkills);
    const selectedSkillUuid = this.calcState.primarySkillUuid;
    const selectedSkillName = this.calcState.primarySkillName;
    
    // Find the bonus for the selected skill for all participants (for display)
    for (const p of this.participants.values()) {
      const allSkills = p.actor.system._skills.map(RMUSkillParser.getSkillData);
      const skill = allSkills.find(s => s.name === selectedSkillName);
      p.bonusForSelectedSkill = skill ? skill.bonus : 0;
    }
    
    // Get only skills with ranks for the complementary dropdown
    const primaryComplementOptions = RMUSkillParser.groupSkills(primaryActor ? primaryActor.allSkills : []);
    const otherParticipants = participants.filter(p => p.id !== this.calcState.primaryActorId);
    const calculation = this._calculateBonus(allPrimarySkills);

    return {
      participants: Array.from(this.participants.values()),
      primaryActorId: this.calcState.primaryActorId,
      primarySkillOptions: primarySkillOptionsGrouped,
      primarySkillUuid: selectedSkillUuid,
      primarySkillName: selectedSkillName,
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
    $content.find(".rmu-primary-actor-select").on("change", this._onChangePrimaryActor.bind(this));
    $content.find(".rmu-primary-skill-select").on("change", this._onChangePrimarySkill.bind(this));
    $content.find(".rmu-primary-comp-add").on("click", this._onAddPrimaryComp.bind(this));
    $content.find(".rmu-primary-comp-skill").on("change", this._onChangePrimaryComp.bind(this));
    $content.find(".rmu-primary-comp-delete").on("click", this._onDeletePrimaryComp.bind(this));
    $content.find(".rmu-other-comp-skill").on("change", this._onChangeOtherComp.bind(this));
    $content.find(".rmu-send-chat").on("click", this._onSendToChat.bind(this));
  }
  
  /**
   * Handles changing the primary actor.
   * @param {Event} event - The change event.
   * @private
   */
  _onChangePrimaryActor(event) {
    this.calcState.primaryActorId = event.currentTarget.value;
    this.calcState.primarySkillUuid = null;
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
    const selectedIndex = event.currentTarget.selectedIndex;
    const selectedOption = event.currentTarget.options[selectedIndex];
    
    this.calcState.primarySkillUuid = event.currentTarget.value;
    this.calcState.primarySkillName = selectedOption.text.trim();
    this.render();
  }

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
    const skillUuid = event.currentTarget.value; // This is now a UUID
    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    
    // Find the skill by its UUID
    const skillData = primaryActor?.allSkills.find(s => s.uuid === skillUuid);

    this.calcState.primaryActorSkills[index] = {
      uuid: skillUuid, // Store the UUID for the 'selected' helper
      name: skillData?.name || "Unknown", // Store name for calculation breakdown
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
    const skillUuid = event.currentTarget.value; // This is now a UUID
    
    // Store the UUID, not the name
    this.calcState.otherActorSkills[actorId] = skillUuid;
    this.render();
  }
  
  /**
   * Sends the calculated skill boost to the chat.
   * @param {Event} event - The click event.
   * @private
   */
  async _onSendToChat(event) {
     const primaryActor = this.participants.get(this.calcState.primaryActorId);
     
     const allPrimarySkills = primaryActor ? 
      primaryActor.actor.system._skills
        .map(RMUSkillParser.getSkillData)
        .filter(sk => !sk.disabledBySystem)
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
       total: calc.total
     };

     // Get all enabled participants in the calculation
     const participants = this.getEnabledParticipants();
     const ownerIds = [];
     for (const p of participants) {
         if (!p.actor) continue;
         for (const [userId, level] of Object.entries(p.actor.ownership)) {
             if (level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
                 ownerIds.push(userId);
             }
         }
     }
     const gmUsers = ChatMessage.getWhisperRecipients("GM");
     const allRecipients = Array.from(new Set([...ownerIds, ...gmUsers]));

     const content = await foundry.applications.handlebars.renderTemplate(
       "modules/rmu-complementary-skills/templates/chat-boost-skill.hbs", 
       templateData
     );
     
     ChatMessage.create({
       user: game.user.id,
       content: content,
       whisper: allRecipients,
       flags: { 
         "rmu-complementary-skills": { 
           isCalc: true,
           rollType: "boost",
           actorId: primaryActor.actor.id,
           skillUuid: this.calcState.primarySkillUuid,
           bonus: calc.complementBonus // Send the "additional bonus"
         } 
       }
     });

     this.close();
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

    // Use UUID to find the primary skill
    const primarySkill = (
      allPrimarySkills ||
      primaryActor.actor.system._skills.map(RMUSkillParser.getSkillData)
    ).find((s) => s.uuid === this.calcState.primarySkillUuid);
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
    for (const [actorId, skillUuid] of Object.entries(
      this.calcState.otherActorSkills
    )) {
      const participant = this.participants.get(actorId);
      if (participant && participant.enabled && skillUuid) {
        const skillData = participant.allSkills.find(
          (s) => s.uuid === skillUuid
        );
        if (skillData && skillData.ranks > 0) {
          complementRanks.push({
            name: `${participant.name}'s ${skillData.name}`,
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