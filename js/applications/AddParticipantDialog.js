/**
 * A pure DialogV2 implementation, based on the API documentation.
 */
export class AddParticipantDialog extends foundry.applications.api.DialogV2 {

  constructor(existingParticipants, onAddCallback) {
    console.log("RMU COMP SKILLS | AddParticipantDialog opening...");

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

    // Call super() with the correct DialogV2 configuration
    super({
      id: "rmu-add-participant-dialog",
      // --- THIS IS THE FIX (Part 1) ---
      // The title must be in a 'window' object
      window: { title: "Add Participants" },
      // --- END FIX ---
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
      submit: (result) => {
        console.log("RMU COMP SKILLS | 'submit' function fired.");
        
        if (result && result.length > 0) {
          console.log("RMU COMP SKILLS | Token IDs to add:", result);
          const addedTokens = allTokens.filter(token => result.includes(token.id));
          console.log("RMU COMP SKILLS | Token objects to add:", addedTokens.length);

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