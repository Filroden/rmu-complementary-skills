import { BaseCalculatorApp } from "./BaseCalculatorApp.js";
import { RmuSkillParser } from "../utils/RmuSkillParser.js";

export class BoostSkillApp extends BaseCalculatorApp {
  constructor(tokens, options = {}) {
    super(tokens, options);

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
  
  async getSpecificUiContext(options) {
    const participants = this.getEnabledParticipants();
    if (participants.length === 0) return { participants: [] };

    if (!this.participants.get(this.calcState.primaryActorId)?.enabled) {
      this.calcState.primaryActorId = participants[0]?.id || null;
      this.calcState.primarySkillName = null;
      this.calcState.primaryActorSkills = [];
    }

    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    
    const primarySkillOptions = primaryActor ? 
      primaryActor.actor.system._skills
        .map(RmuSkillParser.getSkillData)
        .sort(RmuSkillParser.sortSkills)
      : [];
    
    // Get the selected skill name
    const selectedSkillName = this.calcState.primarySkillName;
    
    // Iterate over all participants to find their bonus for the selected skill
    for (const p of this.participants.values()) {
      const allSkills = p.actor.system._skills.map(RmuSkillParser.getSkillData);
      const skill = allSkills.find(s => s.name === selectedSkillName);
      p.bonusForSelectedSkill = skill ? skill.bonus : 0;
    }
    
    const primaryComplementOptions = primaryActor ? primaryActor.allSkills : [];
    
    const otherParticipants = participants.filter(p => p.id !== this.calcState.primaryActorId);

    const calculation = this._calculateBonus(primarySkillOptions);

    return {
      participants: Array.from(this.participants.values()),
      primaryActorId: this.calcState.primaryActorId,
      primarySkillOptions: primarySkillOptions,
      primarySkillName: this.calcState.primarySkillName,
      primaryComplementOptions: primaryComplementOptions,
      primaryActorSkills: this.calcState.primaryActorSkills,
      otherParticipants: otherParticipants,
      otherActorSkills: this.calcState.otherActorSkills,
      calculation: calculation,
    };
  }
  
  attachSubclassListeners($content) {
    // --- State-changing listeners ---
    $content.find(".rmu-primary-actor-select").on("change", this._onChangePrimaryActor.bind(this));
    $content.find(".rmu-primary-skill-select").on("change", this._onChangePrimarySkill.bind(this));
    $content.find(".rmu-primary-comp-add").on("click", this._onAddPrimaryComp.bind(this));
    $content.find(".rmu-primary-comp-skill").on("change", this._onChangePrimaryComp.bind(this));
    $content.find(".rmu-primary-comp-delete").on("click", this._onDeletePrimaryComp.bind(this));
    $content.find(".rmu-other-comp-skill").on("change", this._onChangeOtherComp.bind(this));
    $content.closest(".window-app").find(".rmu-send-chat").on("click", this._onSendToChat.bind(this));
  }
  
  _onChangePrimaryActor(event) {
    this.calcState.primaryActorId = event.currentTarget.value;
    this.calcState.primarySkillName = null;
    this.calcState.primaryActorSkills = [];
    this.calcState.otherActorSkills = {};
    this.render();
  }

  _onChangePrimarySkill(event) {
    this.calcState.primarySkillName = event.currentTarget.value;
    this.render();
  }

  _onAddPrimaryComp(event) {
    this.calcState.primaryActorSkills.push({ name: null, ranks: 0 });
    this.render();
  }

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
  
  _onDeletePrimaryComp(event) {
    const index = event.currentTarget.dataset.index;
    this.calcState.primaryActorSkills.splice(index, 1);
    this.render();
  }
  
  _onChangeOtherComp(event) {
    const actorId = event.currentTarget.dataset.id;
    const skillName = event.currentTarget.value;
    this.calcState.otherActorSkills[actorId] = skillName;
    this.render();
  }
  
  _onSendToChat(event) {
     const calc = this._calculateBonus();
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
  
  _calculateBonus(primarySkillOptions) {
    const primaryActor = this.participants.get(this.calcState.primaryActorId);
    if (!primaryActor) return {};

    // 1. Get Primary Skill Bonus
    const primarySkill = (primarySkillOptions || primaryActor.actor.system._skills.map(RmuSkillParser.getSkillData))
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
        const skillData = participant.allSkills.find(s => s.name === skillName);
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