/**
 * This script initializes the RMU Complementary Skills module.
 * It imports application classes, registers helpers, and adds control buttons.
 */

import { LauncherApp } from "./applications/LauncherApp.js";
import { BoostSkillApp } from "./applications/BoostSkillApp.js";
import { GroupTaskApp } from "./applications/GroupTaskApp.js";
import { AddParticipantDialog } from "./applications/AddParticipantDialog.js";
import { RMUSkillParser } from "./utils/RMUSkillParser.js";

/**
 * Registers Handlebars helpers.
 */
Hooks.once("init", () => {
  Handlebars.registerHelper("rmucsSelected", function (condition) { return condition ? "selected" : ""; });
  Handlebars.registerHelper("checked", function (condition) { return condition ? "checked" : ""; });
  Handlebars.registerHelper("disabled", function (condition) { return condition ? "disabled" : ""; });
  Handlebars.registerHelper("eq", function (a, b) { return a === b; });
  Handlebars.registerHelper("not", function (a) { return !a; });
  
  // Formats a number to always show a sign (+5, -2, +0)
  Handlebars.registerHelper("signed", function (value) {
    const num = Number(value);
    if (isNaN(num)) return value;
    // Uses the game's current language for formatting (e.g., commas vs dots)
    return new Intl.NumberFormat(game.i18n.lang, { signDisplay: "always" }).format(num);
  });
});

/**
 * Registers the application classes with the game object after the "ready" hook.
 * The classes are already loaded, so this assignment is synchronous.
 */
Hooks.once("ready", () => {
  try {
    // Assign the imported classes to a namespace within the game object.
    game.rmuComplementarySkills = {
      LauncherApp,
      BoostSkillApp,
      GroupTaskApp,
      AddParticipantDialog,
      RMUSkillParser
    };
  } catch (error) {
    console.error(
      "RMU COMP SKILLS | Failed to register application classes:",
      error
    );
  }
});

/**
 * Hooks into chat message rendering to add custom styling and attach roll logic
 * to messages created by this module.
 */
Hooks.on("renderChatMessageHTML", (message, html) => {
  const flags = message.flags?.["rmu-complementary-skills"];
  if (!flags?.isCalc) return;

  const $html = $(html);
  
  $html.addClass("rmu-calc-message");

  const $button = $html.find(".rmu-roll-skill-button");
  if ($button.length === 0) return;

  const { rollType, actorId, skillUuid, bonus } = flags;

  $button.on("click", async (ev) => {
    const token = canvas.tokens.ownedTokens.find(t => t.actor?.id === actorId);
    if (!token?.actor) {
      ui.notifications.warn(game.i18n.format("RMU_CS.Notifications.TokenRequired", {name: actorId}));
      return;
    }

    const skillObject = RMUSkillParser.getRawSkillById(token.actor, skillUuid);

    if (!skillObject) {
      ui.notifications.error(game.i18n.localize("RMU_CS.Notifications.SkillNotFound"));
      return;
    }

    const maneuverOptions = {}; 
    if (rollType === "boost") {
      maneuverOptions.otherBonus = Number(bonus);
    } else if (rollType === "group") {
      maneuverOptions.overrideSkillBonus = Number(bonus);
    }

    if (game.system?.api?.rmuTokenSkillAction) {
      game.system.api.rmuTokenSkillAction(token, skillObject, maneuverOptions);
    } else {
      ui.notifications.error(game.i18n.localize("RMU_CS.Notifications.ApiNotFound"));
    }
  });
});

/**
 * Adds a new button to the Token Controls menu (typically on the left-hand side of the screen).
 * This button is only visible to Game Masters (GMs).
 * When clicked, it opens the LauncherApp for the currently selected tokens.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  // Only show the button to GMs.
  if (!game.user.isGM) return;

  // Find the token controls section.
  let tokenControls = null;
  for (const key in controls) {
    if (controls[key].name === "tokens") {
      tokenControls = controls[key];
      break;
    }
  }

  if (tokenControls) {
    // Add the new button to the token controls.
    tokenControls.tools["rmu-complementary-skills"] = {
      name: "rmu-complementary-skills",
      title: "RMU_CS.Title", // Foundry automatically localizes tool titles if matches a key
      icon: "rmu-skill-button-icon",
      /**
       * Handles the click event for the control button.
       * It checks for selected tokens and opens the LauncherApp.
       */
      onChange: () => {
        // Ensure the application classes have been registered.
        if (!game.rmuComplementarySkills?.LauncherApp) {
          console.error("RMU COMP SKILLS | Button clicked, but apps are not registered.");
          ui.notifications.error(game.i18n.localize("RMU_CS.Notifications.NotInitialized"));
          return;
        }

        const controlledTokens = canvas.tokens.controlled;
        // Ensure at least one token is selected.
        if (controlledTokens.length === 0) {
          ui.notifications.warn(game.i18n.localize("RMU_CS.Notifications.SelectOne"));
          return;
        }

        // Open the launcher application with the selected tokens.
        new game.rmuComplementarySkills.LauncherApp(controlledTokens).render(true);
      },
      button: true, 
    };
  }
});