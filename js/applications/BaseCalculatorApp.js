import { RmuSkillParser } from "../utils/RmuSkillParser.js";
// --- THIS IS THE FIX (Part 1) ---
// Import the new dialog class
import { AddParticipantDialog } from "./AddParticipantDialog.js";
// --- END FIX ---

export class BaseCalculatorApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2){
  
  constructor(tokens, options = {}) {
    super(options); 
    this.initialTokens = tokens;
    this.participants = new Map();
  }

  static get title() {
    return "RMU Calculator"; 
  }
  static get template() {
    return ""; 
  }
  static get classes() {
    return ["rmu-calc-app"]; 
  }
  static get controls() {
    return [{
      "name": "close",
      "label": "Close Window",
      "icon": "fa-solid fa-xmark",
      "action": "close"
    }];
  }
  static get defaultOptions() {
    return {
      v13: true,
      width: 600,
      height: "auto",
      resizable: true
    };
  }
  
  async _prepareContext(options) {
    // This is the data-loading logic
    if (this.participants.size === 0 || options?.forceReload) {
      const newParticipants = new Map();
      let maxLeadership = -1;
      let defaultLeaderId = null;
      
      // We iterate over 'this.initialTokens', which may have been
      // added to by our 'Add Participant' button
      for (const token of this.initialTokens) {
        // Prevent duplicates if a token is already in the map
        if (newParticipants.has(token.id)) continue; 
        
        const allSkills = await RmuSkillParser.getSkillsForToken(token);
        const leadershipRanks = RmuSkillParser.getLeadershipRanks(allSkills);
        
        const skillsWithRanks = allSkills
          .map(RmuSkillParser.getSkillData)
          .filter(sk => sk.ranks > 0)
          .sort(RmuSkillParser.sortSkills); 
          
        newParticipants.set(token.id, {
          id: token.id,
          name: token.name,
          img: token.document.texture.src,
          actor: token.actor,
          enabled: true, 
          leadershipRanks: leadershipRanks,
          allSkills: skillsWithRanks, 
        });
        if (leadershipRanks > maxLeadership) {
          maxLeadership = leadershipRanks;
          defaultLeaderId = token.id;
        }
      }
      this.participants = newParticipants;
      this._defaultLeaderId = defaultLeaderId;
    }
    
    const uiContext = await this.getSpecificUiContext(options); 
    return uiContext;
  }

  async _postRender(context, html, options) {
    const $app = $(this.element);
    const $content = $app.find(".window-content");

    $app.attr("id", this.constructor.id);
    $app.addClass(this.constructor.classes.join(" "));
    $app.find(".window-title").text(this.constructor.title);

    const ctx = await this._prepareContext(options);
    const tpl = await renderTemplate(this.constructor.template, ctx);
    $content.html(tpl);

    $content.find(".rmu-participant-enable").on("change", this._onToggleParticipant.bind(this));
    $content.find(".rmu-add-participant").on("click", this._onAddParticipant.bind(this));
    
    this.attachSubclassListeners($content);
  }

  async getSpecificUiContext(options) {
    return {
      participants: Array.from(this.participants.values()),
    };
  }

  attachSubclassListeners($content) {
    // Subclasses will override this
  }

  _onToggleParticipant(event) {
    const participantId = event.currentTarget.dataset.id;
    const participant = this.participants.get(participantId);
    if (participant) {
      participant.enabled = event.currentTarget.checked;
      this.render(); 
    }
  }

  // --- THIS IS THE FIX (Part 2) ---
  _onAddParticipant(event) {
    // 'this.participants' is the Map of current participants.
    // We pass it to the dialog so it can filter them out.
    new AddParticipantDialog(this.participants, (newTokens) => {
      // This is the success callback. 'newTokens' is an array
      // of Token objects selected from the dialog.
      
      // Add the new tokens to our original list
      this.initialTokens.push(...newTokens);
      
      // Force a full re-render, which will re-run _prepareContext
      // and re-run _prepareData with the new token list.
      this.render(true, { forceReload: true });
    });
  }
  // --- END FIX ---
  
  getEnabledParticipants() {
    return Array.from(this.participants.values()).filter(p => p.enabled);
  }
}