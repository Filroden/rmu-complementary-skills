// Register the applications
Hooks.once("ready", () => {
  // We must dynamically import the classes *inside* a hook.
  Promise.all([
    import("./applications/LauncherApp.js"),
    import("./applications/BoostSkillApp.js"),
    import("./applications/GroupTaskApp.js"),
    import("./applications/AddParticipantDialog.js") // <-- ADD THIS LINE
  ])
    .then(([launcher, boost, group, addDialog]) => {
      // Now that all classes are safely loaded, register them.
      game.rmuComplementarySkills = {
        LauncherApp: launcher.LauncherApp,
        BoostSkillApp: boost.BoostSkillApp,
        GroupTaskApp: group.GroupTaskApp,
        AddParticipantDialog: addDialog.AddParticipantDialog // <-- ADD THIS LINE
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
 * Add a new button to the Token Controls (left-hand menu)
 */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;

  let tokenControls = null;
  for (const key in controls) {
    if (controls[key].name === "tokens") {
      tokenControls = controls[key];
      break;
    }
  }

  if (tokenControls) {
    tokenControls.tools["rmu-complementary-skills"] = {
      name: "rmu-complementary-skills",
      title: "RMU Complementary Skills",
      icon: "rmu-skill-button-icon",
      onClick: () => {
        if (!game.rmuComplementarySkills?.LauncherApp) {
          console.error("RMU COMP SKILLS | Button clicked, but apps are not registered.");
          ui.notifications.error("RMU Complementary Skills module is not yet initialized.");
          return;
        }

        const controlledTokens = canvas.tokens.controlled;
        if (controlledTokens.length === 0) {
          ui.notifications.warn("Please select at least one token to use the Complementary Skills calculator.");
          return;
        }

        new game.rmuComplementarySkills.LauncherApp(controlledTokens).render(true);
      },
      button: true, 
    };
  }
});