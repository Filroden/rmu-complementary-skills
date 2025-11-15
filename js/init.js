/**
 * This script initializes the RMU Complementary Skills module.
 * It imports application classes, registers helpers, and adds control buttons.
 */

import { LauncherApp } from "./applications/LauncherApp.js";
import { BoostSkillApp } from "./applications/BoostSkillApp.js";
import { GroupTaskApp } from "./applications/GroupTaskApp.js";
import { AddParticipantDialog } from "./applications/AddParticipantDialog.js";

/**
 * Registers Handlebars helpers.
 */
Hooks.once("init", () => {
  Handlebars.registerHelper("selected", function (condition) { return condition ? "selected" : ""; });
  Handlebars.registerHelper("checked", function (condition) { return condition ? "checked" : ""; });
  Handlebars.registerHelper("disabled", function (condition) { return condition ? "disabled" : ""; });
  Handlebars.registerHelper("eq", function (a, b) { return a === b; });
  Handlebars.registerHelper("not", function (a) { return !a; });
});

/**
 * Registers the application classes with the game object after the "ready" hook.
 * The classes are already loaded, so this assignment is synchronous.
 */
Hooks.once("ready", () => {
  try {
    // Assign the imported classes to a namespace within the game object.
    game.rmuComplementarySkills = {
      LauncherApp: LauncherApp,
      BoostSkillApp: BoostSkillApp,
      GroupTaskApp: GroupTaskApp,
      AddParticipantDialog: AddParticipantDialog
    };
  } catch (error) {
    console.error(
      "RMU COMP SKILLS | Failed to register application classes:",
      error
    );
  }
});

/**
 * Hooks into chat message rendering to add a custom class to the top-level <li>
 * for messages created by this module.
 */
Hooks.on("renderChatMessageHTML", (message, html) => {
  // Check for our specific flag
  const flags = message.flags?.["rmu-complementary-skills"];
  
  if (flags?.isCalc) {
    // 'html' can be either an HTMLElement or a jQuery object.
    // Wrapping in $() and using .addClass() safely handles both cases.
    $(html).addClass("rmu-calc-message");
  }
});

/**
 * Adds a new button to the Token Controls menu (typically on the left-hand side of the screen).
 * This button is only visible to Game Masters (GMs).
 * When clicked, it opens the LauncherApp for the currently selected tokens.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  // Only show the button to Game Masters.
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
      title: "RMU Complementary Skills",
      icon: "rmu-skill-button-icon",
      /**
       * Handles the click event for the control button.
       * It checks for selected tokens and opens the LauncherApp.
       */
      onChange: () => {
        // Ensure the application classes have been registered.
        if (!game.rmuComplementarySkills?.LauncherApp) {
          console.error("RMU COMP SKILLS | Button clicked, but apps are not registered.");
          ui.notifications.error("RMU Complementary Skills module is not yet initialized.");
          return;
        }

        const controlledTokens = canvas.tokens.controlled;
        // Ensure at least one token is selected.
        if (controlledTokens.length === 0) {
          ui.notifications.warn("Please select at least one token to use the Complementary Skills calculator.");
          return;
        }

        // Open the launcher application with the selected tokens.
        new game.rmuComplementarySkills.LauncherApp(controlledTokens).render(true);
      },
      button: true, 
    };
  }
});