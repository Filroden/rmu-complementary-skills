# Version History

| Version | Changes |
| :--- | :--- |
| **Version 1.1.1** | **IMPROVEMENTS**<br>- Restored the Swedish translation file (`sv.json`) with a minor correction. Thank you Ralfsi for reading through the file.|
| **Version 1.1.0** | **IMPROVEMENTS**<br>- **Unified Application:** Removed the Launcher and the separate Boost and Group applications, and created a single application with tabs for each complementary skill type, including a side panel to add additional participants.<br><br>**UNDER THE HOOD**<br>- Replaced all Font Awesome icons with Google Material Design icons.<br>- Refactored the previous code, which supported the four deprecated application and dialogues, into a single, unified `ComplementarySkillsApp.js` file.<br><br>**REMOVED:**<br>- Removed the Swedish translation file (`sv.json`) to make module compliant with Foundry's new AI Content Policy. This can be re-instated if a Swedish speaker can confirm to me that its contents are correct.|
| **Version 1.0.3** | - Fixed to prevent module trying to add actors of other types than characters or creatures.<br>- Removed many console log messages.|
| **Version 1.0.2** | - Fixed appearance of the Scene Tool icon if using Foundry was using OS's light mode.|
| **Version 1.0.1** | - Fixed namespace collision causing an issue with filepicker.<br>- Updated theme styles.|
| **Version 1.0.0** | **FULL RELEASE** - Added Swedish localisation.<br>- Updated theme styles.<br>- Fixed bug preventing unspecialised skills being rolled from the chat message.<br>- Updated documentation.|
| **Version 0.0.7** | - Add internationalisation<br>- Fixed bug preventing selection of primary skill with negative skill bonus (however unlikely it is to be used!).<br>- Convert theme colours to HSL values.|
| **Version 0.0.6** | - Add ability for lead participant or GM to roll the complementary skill from the chat card.<br>- Close Skill Boost or Group Task window when the results are sent to chat.<br>- Fix filename of RmuSkillParser.js to RMUSkillParser.js (which broke v0.0.5).|
| **Version 0.0.5** | - Fix for module initialisation error on hosted services.<br>- Minor styling fixes to chat cards.|
| **Version 0.0.4** | - Add "Send to Chat" for calculator results, whispered to all participants and GMs.|
| **Version 0.0.3** | - Exclude expertise skills from the selectable options.<br>- Add category groups into the selection lists.<br>- Fix missing handlebars helpers.<br>- Improve efficiency of reading actor data for skill values.|
| **Version 0.0.2** | - Globalise css theme across all modules.<br>- Fix bug in skills from other participants not showing their selections in the Boost Skill calculator.<br>- Added skill specialisation into the displayed skill names, which also fixes a lookup bug that was only using the skill name and not the skill name and specialisation.|
| **Version 0.0.1** | - Initial build.|
