export class LauncherApp extends foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2) {
  
  constructor(tokens, options = {}) {
    super(options); 
    this.tokens = tokens;
  }
  
  static get title() {
    return "Complementary Skills Launcher";
  }

  static get template() {
    return "modules/rmu-complementary-skills/templates/launcher-app.hbs";
  }

  static get classes() {
    return ["rmu-calc-app"];
  }

  static get id() {
    return "rmu-skills-launcher";
  }

  static get width() { return 400; }
  static get height() { return "auto"; }

  static get controls() {
    return [{
      "name": "close",
      "label": "Close Window",
      "icon": "fa-solid fa-xmark",
      "action": "close"
    }];
  }
  
  async _prepareContext(options) {
    return {};
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