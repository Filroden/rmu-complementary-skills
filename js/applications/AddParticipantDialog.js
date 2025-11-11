/**
 * A dialog for adding new participants to a group task or skill boost calculation.
 * It displays a list of available tokens from the current scene that are not already part of the calculation.
 * @extends {foundry.applications.api.DialogV2}
 */
export class AddParticipantDialog extends foundry.applications.api.DialogV2 {

  /**
   * Initializes the dialog by filtering out existing participants and preparing the list of available tokens.
   * @param {Set<string>} existingParticipants - A set of token IDs that are already in the calculation.
   * @param {function(Array<Token>)} onAddCallback - A callback function to execute when tokens are added.
   */
  constructor(existingParticipants, onAddCallback) {
    console.log("RMU COMP SKILLS | AddParticipantDialog opening...");

    // Ensure the canvas and tokens are available before proceeding.
    if (!canvas || !canvas.tokens) {
      console.error("RMU COMP SKILLS | 'canvas.tokens' is not available.");
      ui.notifications.error("Cannot add participants: No active canvas found.");
      super({
        title: "Error",
        content: "<p class='rmu-notes'>Cannot add participants: No active canvas found.</p>",
        buttons: [{ label: "Close", action: "close" }],
        classes: ["rmu-calc-app"]
      });
      this.render(true);
      return;
    }

    const allTokens = canvas.tokens.placeables;
    console.log(`RMU COMP SKILLS | Found ${allTokens.length} total tokens on scene.`);

    // Filter out tokens that are already participants or don't have an actor.
    const availableTokens = allTokens.filter(token => 
      token.actor && !existingParticipants.has(token.id)
    );
    console.log(`RMU COMP SKILLS | Found ${availableTokens.length} available tokens.`);

    let content = "";
    if (availableTokens.length > 0) {
      content = `
        <p class="rmu-notes">Select tokens to add to the calculation:</p>
        <div class="rmu-add-list">
      `;
      // Create a checkbox for each available token.
      for (const token of availableTokens) {
        content += `
          <div class="form-group">
            <input type="checkbox" name="${token.id}" id="${token.id}"/>
            <label for="${token.id}">${token.name}</label>
          </div>
        `;
      }
      content += "</div>";
    } else {
      content = `<p class="rmu-notes">No other tokens with actors are available on the scene.</p>`;
    }

    super({
      id: "rmu-add-participant-dialog",
      window: { title: "Add Participants" },
      classes: ["rmu-calc-app"],
      width: 300,
      content: content,
      buttons: [
        {
          action: "add",
          label: "Add",
          icon: "fa-solid fa-plus",
          default: true,
          disabled: availableTokens.length === 0,
          /**
           * Gathers the selected token IDs from the form.
           * @private
           * @param {Event} event - The triggering click event.
           * @param {object} button - The button configuration object.
           * @returns {Array<string>} An array of selected token IDs.
           */
          callback: (event, button, dialog) => {
            console.log("RMU COMP SKILLS | Button callback fired. Returning form data.");
            const elements = button.form.elements;
            const addedTokenIds = [];
            for (const el of elements) {
              if (el.type === "checkbox" && el.checked) {
                addedTokenIds.push(el.name);
              }
            }
            return addedTokenIds;
          }
        },
        {
          action: "cancel",
          label: "Cancel",
          icon: "fa-solid fa-times"
        }
      ],
      /**
       * Processes the selected tokens and passes them to the callback.
       * @param {Array<string>} result - The array of token IDs returned from the callback.
       */
      submit: (result) => {
        console.log("RMU COMP SKILLS | 'submit' function fired.");
        
        if (result && result.length > 0) {
          console.log("RMU COMP SKILLS | Token IDs to add:", result);
          const addedTokens = allTokens.filter(token => result.includes(token.id));
          console.log("RMU COMP SKILLS | Token objects to add:", addedTokens.length);

          // Execute the provided callback with the newly added tokens.
          if (typeof onAddCallback === 'function') {
            console.log("RMU COMP SKILLS | Calling onAddCallback...");
            onAddCallback(addedTokens);
            console.log("RMU COMP SKILLS | onAddCallback finished.");
          } else {
            console.error("RMU COMP SKILLS | onAddCallback is not a function!");
          }
        }
      }
    });

    this.render(true);
  }
}
