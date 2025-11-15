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
 * Hooks into chat message rendering to add custom styling and attach roll logic
 * to messages created by this module.
 */
Hooks.on("renderChatMessageHTML", (message, html) => {
  // Check for our specific flag
  const flags = message.flags?.["rmu-complementary-skills"];
  if (!flags?.isCalc) return;

  // 'html' can be either an HTMLElement or a jQuery object.
  const $html = $(html);
  
  // 1. Add styling class
  $html.addClass("rmu-calc-message");

  // 2. Find the new roll button
  const $button = $html.find(".rmu-roll-skill-button");
  if ($button.length === 0) return; // No button, exit

  // 3. Check for valid data
  const { rollType, actorId, skillUuid, bonus } = flags;
  if (!rollType || !actorId || !skillUuid) {
    $button.prop("disabled", true);
    return;
  }

  // 4. Check permissions
  const actor = game.actors.get(actorId);
  const currentUser = game.user;
  const isGM = currentUser.isGM;
  // Check if the user is an OWNER of the rolling actor
  const isOwner = actor ? actor.testUserPermission(currentUser, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) : false;

  if (!isGM && !isOwner) {
    // User is not allowed, disable the button and stop
    $button.prop("disabled", true);
    return;
  }

  // 5. User is allowed, attach the click event
  $button.on("click", async (ev) => {
    // 5.1. Find the Token on the current scene
    const token = canvas.tokens.ownedTokens.find(t => t.actor?.id === actorId);
    if (!token) {
      ui.notifications.warn(`The token for ${actor.name} must be on the current scene to roll.`);
      return;
    }

    // 5.2. Find the Skill Item from its UUID
    const skillItem = await fromUuid(skillUuid);
    if (!skillItem) {
      ui.notifications.error(`Could not find the skill item (UUID: ${skillUuid}).`);
      return;
    }

    // 5.3. Prepare the API maneuverOptions
    const maneuverOptions = {}; 

    if (rollType === "boost") {
      maneuverOptions.otherBonus = Number(bonus);
    } else if (rollType === "group") {
      maneuverOptions.overrideSkillBonus = Number(bonus);
    }

    // 5.4. Call the API using the correct path
    if (game.system?.api?.rmuTokenSkillAction) {
      game.system.api.rmuTokenSkillAction(token, skillItem, maneuverOptions);
    } else {
      console.error("RMU COMP SKILLS | Could not find API at game.system.api.rmuTokenSkillAction");
      ui.notifications.error("RMU System API not found.");
    }
  });
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