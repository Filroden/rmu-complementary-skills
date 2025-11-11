import { RmuSkillParser } from "../utils/RmuSkillParser.js";
import { AddParticipantDialog } from "./AddParticipantDialog.js";

/**
 * A base class for calculator applications, providing common functionality for managing participants.
 * It handles adding, enabling/disabling, and fetching skills for tokens.
 * @abstract
 * @extends {foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2)}
 */
export class BaseCalculatorApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2){
  
  /**
   * Initializes the application with a set of tokens and sets up the participant map.
   * @param {Array<Token>} tokens - The initial array of tokens to include in the calculator.
   * @param {object} [options={}] - Application rendering options.
   */
  constructor(tokens, options = {}) {
    super(options); 
    /**
     * The initial set of tokens passed to the application.
     * @type {Array<Token>}
     */
    this.initialTokens = tokens;
    /**
     * A map of participant data, keyed by token ID.
     * @type {Map<string, object>}
     */
    this.participants = new Map();
  }

  /**
   * The default title for the application window.
   * @returns {string}
   */
  static get title() {
    return "RMU Calculator"; 
  }

  /**
   * The CSS classes to apply to the application window.
   * @returns {Array<string>}
   */
  static get classes() {
    return ["rmu-calc-app"]; 
  }

  /**
   * The window controls to be displayed in the application header.
   * @returns {Array<object>}
   */
  static get controls() {
    return [{
      "name": "close",
      "label": "Close Window",
      "icon": "fa-solid fa-xmark",
      "action": "close"
    }];
  }

  /**
   * Default options for the application window.
   * @returns {object}
   */
  static get defaultOptions() {
    return {
      v13: true,
      width: 600,
      height: "auto",
      resizable: true
    };
  }
  
  /**
   * Prepares the data context for rendering the application.
   * It loads participant skills and determines a default leader if one is not already set.
   * @param {object} [options] - Options to customize context preparation.
   * @param {boolean} [options.forceReload=false] - If true, forces a full reload of participant data.
   * @returns {Promise<object>} The context object for the Handlebars template.
   * @private
   */
  async _prepareContext(options) {
    // Load participant data if it's the first load or a force reload is requested.
    if (this.participants.size === 0 || options?.forceReload) {
      const newParticipants = new Map();
      let maxLeadership = -1;
      let defaultLeaderId = null;
      
      for (const token of this.initialTokens) {
        if (newParticipants.has(token.id)) continue; 
        
        // Fetch all skills and leadership ranks for the token.
        const allSkills = await RmuSkillParser.getSkillsForToken(token);
        const leadershipRanks = RmuSkillParser.getLeadershipRanks(allSkills);
        
        // Filter and sort skills to show only those with ranks.
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

        // Determine the default leader based on the highest leadership rank.
        if (leadershipRanks > maxLeadership) {
          maxLeadership = leadershipRanks;
          defaultLeaderId = token.id;
        }
      }
      this.participants = newParticipants;
      this._defaultLeaderId = defaultLeaderId;
    }
    
    // Get the UI-specific context from the subclass.
    const uiContext = await this.getSpecificUiContext(options); 
    return uiContext;
  }

  /**
   * Renders the application's HTML, preparing the context first.
   * @param {object} context - The rendering context.
   * @param {object} options - Rendering options.
   * @returns {Promise<string>} The rendered HTML.
   * @private
   */
  async _renderHTML(context, options) {
    const renderContext = await this._prepareContext(options);
    
    return foundry.applications.handlebars.renderTemplate(
      this.constructor.template, 
      renderContext
    );
  }

  /**
   * Replaces the application's HTML content with the newly rendered result.
   * @param {string} result - The new HTML content.
   * @param {HTMLElement} content - The content element to update.
   * @private
   */
  _replaceHTML(result, content, options) {
    $(content).html(result);
  }

  /**
   * Attaches event listeners after the application is rendered.
   * @param {object} context - The rendering context.
   * @param {object} options - Rendering options.
   * @private
   */
  async _postRender(context, options) {
    const $app = $(this.element);
    const $content = $app.find(".window-content");

    // Apply dynamic properties to the application window.
    $app.attr("id", this.constructor.id);
    $app.addClass(this.constructor.classes.join(" "));
    $app.find(".window-title").text(this.constructor.title);

    // Attach common event listeners.
    $content.find(".rmu-participant-enable").on("change", this._onToggleParticipant.bind(this));
    $content.find(".rmu-add-participant").on("click", this._onAddParticipant.bind(this));
    
    // Attach listeners specific to the subclass implementation.
    this.attachSubclassListeners($content);
  }

  /**
   * Gets the UI-specific context for the subclass.
   * @param {object} options - Context preparation options.
   * @returns {Promise<object>} The UI context object.
   * @protected
   */
  async getSpecificUiContext(options) {
    return {
      participants: Array.from(this.participants.values()),
    };
  }

  /**
   * A placeholder for subclasses to attach their own event listeners.
   * @param {jQuery} $content - The jQuery object for the content element.
   * @protected
   */
  attachSubclassListeners($content) { }

  /**
   * Handles the toggling of a participant's enabled state.
   * @param {Event} event - The change event.
   * @private
   */
  _onToggleParticipant(event) {
    const participantId = event.currentTarget.dataset.id;
    const participant = this.participants.get(participantId);
    if (participant) {
      participant.enabled = event.currentTarget.checked;
      this.render(); 
    }
  }

  /**
   * Opens the dialog to add new participants.
   * @param {Event} event - The click event.
   * @private
   */
  _onAddParticipant(event) {
    new AddParticipantDialog(this.participants, (newTokens) => {
      this.initialTokens.push(...newTokens);
      this.render(true, { forceReload: true });
    });
  }
  
  /**
   * Retrieves an array of all currently enabled participants.
   * @returns {Array<object>} The enabled participants.
   */
  getEnabledParticipants() {
    return Array.from(this.participants.values()).filter(p => p.enabled);
  }
}
