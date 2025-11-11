/**
 * A launcher application that provides buttons to open either the Boost Skill or Group Task calculators.
 * @extends {foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2)}
 */
export class LauncherApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  
  /**
   * Initializes the launcher with the selected tokens.
   * @param {Array<Token>} tokens - The tokens to be passed to the calculator applications.
   * @param {object} [options={}] - Application rendering options.
   */
  constructor(tokens, options = {}) {
    super(options); 
    /**
     * The tokens that will be used in the calculator applications.
     * @type {Array<Token>}
     */
    this.tokens = tokens;
  }
  
  /**
   * The title of the application window.
   * @returns {string}
   */
  static get title() { return "Complementary Skills Launcher"; }

  /**
   * The path to the Handlebars template for the application.
   * @returns {string}
   */
  static get template() { return "modules/rmu-complementary-skills/templates/launcher-app.hbs"; }

  /**
   * The CSS classes to apply to the application window.
   * @returns {Array<string>}
   */
  static get classes() { return ["rmu-calc-app"]; }

  /**
   * The unique ID of the application window.
   * @returns {string}
   */
  static get id() { return "rmu-skills-launcher"; }

  /**
   * The width of the application window.
   * @returns {number}
   */
  static get width() { return 400; }

  /**
   * The height of the application window.
   * @returns {string}
   */
  static get height() { return "auto"; }

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
   * Prepares the data context for rendering the application.
   * @param {object} options - Context preparation options.
   * @returns {Promise<object>} The context object for the Handlebars template.
   * @private
   */
  async _prepareContext(options) {
    return {};
  }

  /**
   * Renders the application's HTML.
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
   * Replaces the application's HTML content.
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

    // Attach listeners to the launch buttons.
    $content.find("[data-action='open-rule1']").on("click", () => {
      new game.rmuComplementarySkills.BoostSkillApp(this.tokens).render(true);
      this.close();
    });

    $content.find("[data-action='open-rule2']").on("click", () => {
      new game.rmuComplementarySkills.GroupTaskApp(this.tokens).render(true);
      this.close();
    });
  }
}
