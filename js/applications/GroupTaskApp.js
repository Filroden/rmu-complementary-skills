import { BaseCalculatorApp } from "./BaseCalculatorApp.js";
import { RmuSkillParser } from "../utils/RmuSkillParser.js";

export class GroupTaskApp extends BaseCalculatorApp {
  constructor(tokens, options = {}) {
    super(tokens, options);

    this.calcState = {
      leaderId: null,
      taskSkillName: null,
    };
  }

  static get title() {
    return "Calculate Group Task";
  }

  static get template() {
    return "modules/rmu-complementary-skills/templates/group-task-app.hbs";
  }
  
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    if (this._defaultLeaderId && !this.calcState.leaderId) {
      this.calcState.leaderId = this._defaultLeaderId;
    }
    
    return context;
  }

  async getSpecificUiContext(options) {
    const participants = this.getEnabledParticipants();

    if (!this.participants.get(this.calcState.leaderId)?.enabled) {
      this.calcState.leaderId = participants.find(p => p.leadershipRanks > 0)?.id || participants[0]?.id || null;
    }
    
    // --- THIS IS THE FIX ---
    // Use a Map to get a unique list of *skill objects*
    const skillMap = new Map();
    for (const p of this.participants.values()) {
      const allSkills = p.actor.system._skills.map(RmuSkillParser.getSkillData);
      for (const skill of allSkills) {
        skillMap.set(skill.name, skill);
      }
    }
    // Sort the skill objects, *then* map to their names
    const allSkillOptions = Array.from(skillMap.values())
      .sort(RmuSkillParser.sortSkills)
      .map(skill => skill.name);
    // --- END FIX ---
    
    const selectedSkillName = this.calcState.taskSkillName;
    
    for (const p of this.participants.values()) {
      const allSkills = p.actor.system._skills.map(RmuSkillParser.getSkillData);
      const skill = allSkills.find(s => s.name === selectedSkillName);
      p.bonusForSelectedSkill = skill ? skill.bonus : 0;
    }
    
    const calculation = this._calculateBonus();

    return {
      participants: Array.from(this.participants.values()),
      leaderId: this.calcState.leaderId,
      allSkillOptions: allSkillOptions,
      taskSkillName: this.calcState.taskSkillName,
      calculation: calculation,
    };
  }

  attachSubclassListeners($content) {
    // --- State-changing listeners ---
    $content.find(".rmu-leader-select").on("change", this._onChangeLeader.bind(this));
    $content.find(".rmu-task-skill-select").on("change", this._onChangeTaskSkill.bind(this));
    
    // --- Send to Chat ---
    $content.closest(".window-app").find(".rmu-send-chat").on("click", this._onSendToChat.bind(this));
  }
  
  // --- All helper methods below are unchanged ---

  _onChangeLeader(event) {
    this.calcState.leaderId = event.currentTarget.value;
    this.render();
  }

  _onChangeTaskSkill(event) {
    this.calcState.taskSkillName = event.currentTarget.value;
    this.render();
  }
  
  _onSendToChat(event) {
     const calc = this._calculateBonus();
     if (!calc.taskSkillName) {
       ui.notifications.warn("Please select a Task Skill first.");
       return;
     }
     
     let participantList = calc.participants.map(p => `<li>${p.name}: <strong>+${p.bonus}</strong></li>`).join("");
     
     let content = `
       <strong>Group Task Check</strong>
       <p><strong>Task Skill:</strong> ${calc.taskSkillName}</p>
       <ul>${participantList}</ul>
       <p><strong>Average Skill Bonus: +${calc.averageBonus}</strong></p>
       <p><strong>Leader (${calc.leaderName}):</strong> +${calc.leadershipBonus} Ranks</p>
       <hr>
       <p><strong>Total Maneuver Bonus: +${calc.total}</strong></p>
     `;
     
     ChatMessage.create({
       user: game.user.id,
       content: content,
       whisper: ChatMessage.getWhisperRecipients("GM"),
     });
  }
  
  _calculateBonus() {
    const participants = this.getEnabledParticipants();
    if (participants.length === 0) return {};

    let totalBonus = 0;
    const participantBonuses = [];

    for (const p of participants) {
      const bonus = p.bonusForSelectedSkill || 0;
      totalBonus += bonus;
      participantBonuses.push({ name: p.name, bonus: bonus });
    }
    
    const averageBonus = (participants.length > 0) ? (totalBonus / participants.length) : 0;

    const leader = this.participants.get(this.calcState.leaderId);
    const leadershipBonus = (leader && leader.enabled) ? leader.leadershipRanks : 0;
    
    return {
      taskSkillName: this.calcState.taskSkillName,
      participants: participantBonuses,
      averageBonus: Math.round(averageBonus),
      leadershipBonus: leadershipBonus,
      leaderName: leader?.name || "None",
      total: Math.round(averageBonus) + leadershipBonus
    };
  }
}