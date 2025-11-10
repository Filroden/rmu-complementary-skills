Hooks.once("ready", () => {
  Promise.all([
    import("./applications/LauncherApp.js"),
    import("./applications/BoostSkillApp.js"),
    import("./applications/GroupTaskApp.js"),
  ])
    .then(([launcher, boost, group]) => {
      game.rmuComplementarySkills = {
        LauncherApp: launcher.LauncherApp,
        BoostSkillApp: boost.BoostSkillApp,
        GroupTaskApp: group.GroupTaskApp,
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
 * Add a new button to the Token Controls (left-hand menu on scene)
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
      icon: "rmu-skill-button-icon",
      title: "RMU Complementary Skills",

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