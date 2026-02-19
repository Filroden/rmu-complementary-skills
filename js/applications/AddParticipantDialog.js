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
        // Ensure the canvas and tokens are available before proceeding.
        if (!canvas || !canvas.tokens) {
            console.error(
                "RMU COMP SKILLS | 'canvas.tokens' is not available.",
            );
            ui.notifications.error(
                game.i18n.localize("RMU_CS.AddDialog.ErrorCanvas"),
            );
            super({
                title: game.i18n.localize("RMU_CS.AddDialog.ErrorTitle"),
                content: `<p class='rmu-notes'>${game.i18n.localize("RMU_CS.AddDialog.ErrorCanvas")}</p>`,
                buttons: [
                    {
                        label: game.i18n.localize("RMU_CS.Common.Close"),
                        action: "close",
                    },
                ],
                classes: ["rmu-calc-app"],
            });
            this.render(true);
            return;
        }

        const allTokens = canvas.tokens.placeables;

        // Fetch the valid types from the namespace, fallback just in case
        const validActorTypes = game.rmuComplementarySkills
            ?.VALID_ACTOR_TYPES || ["Character", "Creature"];

        // Filter out tokens that are already participants, don't have an actor, OR have an invalid actor type.
        const availableTokens = allTokens.filter(
            (token) =>
                token.actor &&
                validActorTypes.includes(token.actor.type) &&
                !existingParticipants.has(token.id),
        );

        let content = "";
        if (availableTokens.length > 0) {
            content = `
        <p class="rmu-notes">${game.i18n.localize("RMU_CS.AddDialog.Select")}</p>
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
            content = `<p class="rmu-notes">${game.i18n.localize("RMU_CS.AddDialog.NoTokens")}</p>`;
        }

        super({
            id: "rmu-add-participant-dialog",
            window: { title: game.i18n.localize("RMU_CS.AddDialog.Title") },
            classes: ["rmu-calc-app"],
            width: 300,
            content: content,
            buttons: [
                {
                    action: "add",
                    label: game.i18n.localize("RMU_CS.Common.Add"),
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
                        const elements = button.form.elements;
                        const addedTokenIds = [];
                        for (const el of elements) {
                            if (el.type === "checkbox" && el.checked) {
                                addedTokenIds.push(el.name);
                            }
                        }
                        return addedTokenIds;
                    },
                },
                {
                    action: "cancel",
                    label: game.i18n.localize("RMU_CS.Common.Cancel"),
                    icon: "fa-solid fa-times",
                },
            ],
            /**
             * Processes the selected tokens and passes them to the callback.
             * @param {Array<string>} result - The array of token IDs returned from the callback.
             */
            submit: (result) => {
                if (result && result.length > 0) {
                    const addedTokens = allTokens.filter((token) =>
                        result.includes(token.id),
                    );

                    // Execute the provided callback with the newly added tokens.
                    if (typeof onAddCallback === "function") {
                        onAddCallback(addedTokens);
                    } else {
                        console.error(
                            "RMU COMP SKILLS | onAddCallback is not a function!",
                        );
                    }
                }
            },
        });

        this.render(true);
    }
}
