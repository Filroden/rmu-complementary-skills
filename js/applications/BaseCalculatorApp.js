import { RmuSkillParser } from "../utils/RmuSkillParser.js";

// We extend the mixin, just like the launcher
export class BaseCalculatorApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2){
  
  constructor(tokens, options = {}) {
    // We pass 'tokens' to the parent constructor
    super(tokens, options); 
    
    this.initialTokens = tokens;
    this.participants = new Map();
  }

  // --- We add the static getters, just like LauncherApp.js ---

  static get title() {
    return "RMU Calculator"; // Overridden by subclass
  }

  static get template() {
    return ""; // Overridden by subclass
  }

  static get classes() {
    return ["rmu-calc-app"]; // Base class
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
    // Runtime options
    return {
      v13: true,
      width: 600,
      height: "auto",
      resizable: true
    };
  }
  
  // --- This is our working _postRender pattern ---

  async _prepareContext(options) {
    // This is the data-loading logic
    if (this.participants.size === 0 || options?.forceReload) {
      const newParticipants = new Map();
      let maxLeadership = -1;
      let defaultLeaderId = null;
      for (const token of this.initialTokens) {
        const allSkills = await RmuSkillParser.getSkillsForToken(token);
        const leadershipRanks = RmuSkillParser.getLeadershipRanks(allSkills);
        
        // --- THIS IS THE FIX ---
        // We now use the new RmuSkillParser.sortSkills function
        const skillsWithRanks = allSkills
          .map(RmuSkillParser.getSkillData)
          .filter(sk => sk.ranks > 0)
          .sort(RmuSkillParser.sortSkills); // <-- CHANGED
        // --- END FIX ---
          
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
    
    // Call the subclass's data method
    const uiContext = await this.getSpecificUiContext(options); 
    return uiContext;
  }

  async _postRender(context, html, options) {
    const $app = $(this.element);
    const $content = $app.find(".window-content");

    // This ensures the dark theme is applied
    $app.attr("id", this.constructor.id);
    $app.addClass(this.constructor.classes.join(" "));
    $app.find(".window-title").text(this.constructor.title);

    // 1. Get data
    const ctx = await this._prepareContext(options);

    // 2. Render template
    const tpl = await renderTemplate(this.constructor.template, ctx);
    
    // 3. Inject HTML
    $content.html(tpl);

    // 4. Attach shared listeners
    $content.find(".rmu-participant-enable").on("change", this._onToggleParticipant.bind(this));
    $content.find(".rmu-add-participant").on("click", this._onAddParticipant.bind(this));
    
    // 5. Call hook for subclass listeners
    this.attachSubclassListeners($content);
  }

  /**
   * Placeholder for subclasses
   */
  async getSpecificUiContext(options) {
    return {
      participants: Array.from(this.participants.values()),
    };
  }

  /**
   * Placeholder for subclasses
   */
  attachSubclassListeners($content) {
    // Subclasses will override this
  }

  // --- Helper Methods ---

  _onToggleParticipant(event) {
    const participantId = event.currentTarget.dataset.id;
    const participant = this.participants.get(participantId);
    if (participant) {
      participant.enabled = event.currentTarget.checked;
      this.render(); // Re-render to update calculations
    }
  }

  _onAddParticipant(event) {
    ui.notifications.info("TODO: Open 'Add Participant' selection window.");
  }
  
  getEnabledParticipants() {
    return Array.from(this.participants.values()).filter(p => p.enabled);
  }
}