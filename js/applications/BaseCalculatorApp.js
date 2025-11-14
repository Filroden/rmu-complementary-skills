import { RMUSkillParser } from "../utils/RMUSkillParser.js";
import { AddParticipantDialog } from "./AddParticipantDialog.js";

/**
 * A base class for calculator applications, providing common functionality for managing participants.
 * @abstract
 * @extends {foundry.applications.api.HandlebarsApplicationMixin(foundry.applications.api.ApplicationV2)}
 */
export class BaseCalculatorApp extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  constructor(tokens, options = {}) {
    super(options);
    this.initialTokens = tokens;
    this.participants = new Map();
  }

  static get title() {
    return "RMU Calculator";
  }
  static get classes() {
    return ["rmu-calc-app"];
  }

  static get controls() {
    return [
      {
        name: "close",
        label: "Close Window",
        icon: "fa-solid fa-xmark",
        action: "close",
      },
    ];
  }

  static get defaultOptions() {
    return {
      v13: true,
      width: 600,
      height: "auto",
      resizable: true,
    };
  }

  async _prepareContext(options) {
    if (this.participants.size === 0 || options?.forceReload) {
      const newParticipants = new Map();
      let maxLeadership = -1;
      let defaultLeaderId = null;

      for (const token of this.initialTokens) {
        if (newParticipants.has(token.id)) continue;

        const allSkills = await RMUSkillParser.getSkillsForToken(token);
        const leadershipRanks = RMUSkillParser.getLeadershipRanks(allSkills);

        const skillsWithRanks = allSkills
          .map(RMUSkillParser.getSkillData)
          .filter((sk) => sk.ranks > 0 && !sk.disabledBySystem)
          .sort(RMUSkillParser.sortSkills);

        const skillsWithRanksGrouped =
          RMUSkillParser.groupSkills(skillsWithRanks);

        newParticipants.set(token.id, {
          id: token.id,
          name: token.name,
          img: token.document.texture.src,
          actor: token.actor,
          enabled: true,
          leadershipRanks: leadershipRanks,
          allSkills: skillsWithRanks,
          allSkillsGrouped: skillsWithRanksGrouped,
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

  async _renderHTML(context, options) {
    const renderContext = await this._prepareContext(options);
    return foundry.applications.handlebars.renderTemplate(
      this.constructor.template,
      renderContext
    );
  }

  _replaceHTML(result, content, options) {
    $(content).html(result);
  }

  async _postRender(context, options) {
    const $app = $(this.element);
    const $content = $app.find(".window-content");

    $app.attr("id", this.constructor.id);
    $app.addClass(this.constructor.classes.join(" "));
    $app.find(".window-title").text(this.constructor.title);

    $content
      .find(".rmu-participant-enable")
      .on("change", this._onToggleParticipant.bind(this));
    $content
      .find(".rmu-add-participant")
      .on("click", this._onAddParticipant.bind(this));

    this.attachSubclassListeners($content);
  }

  /**
   * A hook for subclasses to prepare their specific UI context.
   * @param {object} options - Context preparation options.
   * @returns {Promise<object>}
   */
  async getSpecificUiContext(options) {
    return { participants: Array.from(this.participants.values()) };
  }

  /**
   * A hook for subclasses to attach their specific event listeners.
   * @param {jQuery} $content - The jQuery object for the content element.
   */
  attachSubclassListeners($content) {}

  /**
   * Handles toggling a participant's inclusion in the calculation.
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
   * Gets a list of all participants who are currently enabled.
   * @returns {Array<object>}
   */
  getEnabledParticipants() {
    return Array.from(this.participants.values()).filter((p) => p.enabled);
  }
}