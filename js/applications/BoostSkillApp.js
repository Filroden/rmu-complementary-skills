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
      primarySkillUuid: null, // This stores the UUID (or stable ID)
      primarySkillName: null,
      primaryActorSkills: [],
      otherActorSkills: {},
    };
  }

  static get title() { return "RMU_CS.Boost.Title"; }
  static get template() { return "modules/rmu-complementary-skills/templates/boost-skill-app.hbs"; }
  
  /**
   * Helper to get the full skill list for an actor, including 0-rank/negative bonus skills.
   * @param {object} participant - The participant object from this.participants
   * @returns {Array<object>} Processed skill objects
   * @private
   */
  _getActorAllSkills(participant) {
    if (!participant || !participant.actor) return [];
    // Always use the recursive parser to find nested skills
    const rawSkills = RMUSkillParser._getAllActorSkills(participant.actor);
    return rawSkills
        .map(RMUSkillParser.getSkillData)
        .filter(sk => !sk.disabledBySystem)
        .sort(RMUSkillParser.sortSkills);
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

    // If the current primary actor is disabled, reset
    if (!this.participants.get(this.calcState.primaryActorId)?.enabled) {
      this.calcState.primaryActorId = participants[0]?.id || null;
      this.calcState.primarySkillUuid = null;
      this.calcState.primarySkillName = null;
      this.calcState.primaryActorSkills = [];
    }

    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    
    // Get ALL skills (including 0 rank/negative bonus)
    const allPrimarySkills = this._getActorAllSkills(primaryActor);
    
    const primarySkillOptionsGrouped = RMUSkillParser.groupSkills(allPrimarySkills);
    const selectedSkillUuid = this.calcState.primarySkillUuid;
    const selectedSkillName = this.calcState.primarySkillName;
    
    // Find the bonus for the selected skill for all participants (for display)
    for (const p of this.participants.values()) {
      // Re-fetch clean list to ensure we can see 0-rank bonuses
      const allPSkills = this._getActorAllSkills(p);
      const skill = allPSkills.find(s => s.name === selectedSkillName);
      p.bonusForSelectedSkill = skill ? skill.bonus : 0;
    }
    
    // Get only skills with ranks for the complementary dropdown (this remains unchanged, as comp skills need ranks)
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
  
  _onChangePrimaryActor(event) {
    this.calcState.primaryActorId = event.currentTarget.value;
    this.calcState.primarySkillUuid = null;
    this.calcState.primarySkillName = null;
    this.calcState.primaryActorSkills = [];
    this.calcState.otherActorSkills = {};
    this.render();
  }

  _onChangePrimarySkill(event) {
    const uuid = event.currentTarget.value;
    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    
    // Use the exact same fetch method as getSpecificUiContext to ensure UUIDs match
    const allSkills = this._getActorAllSkills(primaryActor);
    const skillData = allSkills.find(s => s.uuid === uuid);

    this.calcState.primarySkillUuid = uuid;
    this.calcState.primarySkillName = skillData ? skillData.name : null;
    this.render();
  }

  _onAddPrimaryComp(event) {
    this.calcState.primaryActorSkills.push({ name: null, ranks: 0 });
    this.render();
  }

  _onChangePrimaryComp(event) {
    const index = event.currentTarget.dataset.index;
    const skillUuid = event.currentTarget.value;
    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    
    const skillData = primaryActor?.allSkills.find(s => s.uuid === skillUuid);

    this.calcState.primaryActorSkills[index] = {
      uuid: skillUuid, 
      name: skillData?.name || game.i18n.localize("RMU_CS.Common.UnknownSkill"),
      ranks: skillData?.ranks || 0,
    };
    this.render();
  }

  _onDeletePrimaryComp(event) {
    const index = event.currentTarget.dataset.index;
    this.calcState.primaryActorSkills.splice(index, 1);
    this.render();
  }

  _onChangeOtherComp(event) {
    const actorId = event.currentTarget.dataset.id;
    const skillUuid = event.currentTarget.value;
    
    this.calcState.otherActorSkills[actorId] = skillUuid;
    this.render();
  }
  
  async _onSendToChat(event) {
     const primaryActor = this.participants.get(this.calcState.primaryActorId);
     const allPrimarySkills = this._getActorAllSkills(primaryActor);
     
     const calc = this._calculateBonus(allPrimarySkills);
     
     if (!this.calcState.primarySkillUuid) {
       ui.notifications.warn(game.i18n.localize("RMU_CS.Notifications.SelectPrimary"));
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
           bonus: calc.complementBonus 
         } 
       }
     });

     this.close();
  }
  
  _calculateBonus(allPrimarySkills) {
    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    if (!primaryActor) return {};

    const primarySkill = allPrimarySkills.find((s) => s.uuid === this.calcState.primarySkillUuid);
    const primaryBonus = primarySkill?.bonus || 0;

    let complementRanks = [];

    for (const skill of this.calcState.primaryActorSkills) {
      if (skill.ranks > 0) {
        complementRanks.push({
          name: game.i18n.format("RMU_CS.Boost.BreakdownNameFormat", {actorName: primaryActor.name, skillName: skill.name}),
          ranks: skill.ranks,
        });
      }
    }

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
            name: game.i18n.format("RMU_CS.Boost.BreakdownNameFormat", {actorName: participant.name, skillName: skillData.name}),
            ranks: skillData.ranks,
          });
        }
      }
    }

    complementRanks.sort((a, b) => b.ranks - a.ranks);

    let complementBonus = 0;
    const breakdown = [];

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