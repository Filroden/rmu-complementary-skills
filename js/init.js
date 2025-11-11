/**
 * This script initializes the RMU Complementary Skills module.
 * It registers the application classes and adds a control button to the token controls.
 */

/**
 * Registers the application classes with the game object after the "ready" hook.
 * This ensures that the classes are available for use throughout Foundry VTT.
 */
Hooks.once("ready", () => {
  // Dynamically import all the application classes.
  Promise.all([
    import("./applications/LauncherApp.js"),
    import("./applications/BoostSkillApp.js"),
    import("./applications/GroupTaskApp.js"),
    import("./applications/AddParticipantDialog.js")
  ])
    .then(([launcher, boost, group, addDialog]) => {
      // Assign the imported classes to a namespace within the game object.
      game.rmuComplementarySkills = {
        LauncherApp: launcher.LauncherApp,
        BoostSkillApp: boost.BoostSkillApp,
        GroupTaskApp: group.GroupTaskApp,
        AddParticipantDialog: addDialog.AddParticipantDialog
      };
    })
    .catch((error) => {
      console.error(
        "RMU COMP SKILLS | Failed to import application classes:",
        error
      );
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
