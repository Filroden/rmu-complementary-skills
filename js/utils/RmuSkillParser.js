/**
 * A utility class to interface with the RMU system's skill data.
 * All logic is based on the data model provided in skill-model.md.
 */
export class RmuSkillParser {
  /**
   * Initializes a token's actor and fetches a flat array of all its skills.
   * @param {Token} token - The token to read.
   * @returns {Promise<Array<Object>>} A promise that resolves to an array of raw skill objects.
   */
  static async getSkillsForToken(token) {
    const actor = token?.actor;
    if (!actor) {
      console.warn(`[RMU Comp Skills] Token ${token.name} has no actor.`);
      return [];
    }

    // Check if the RMU system's extended data is already prepared.
    if (actor.system?._hudInitialized !== true) {
      const doc = token?.document ?? token; 

      if (doc && typeof doc.hudDeriveExtendedData === "function") {
        try {
          await doc.hudDeriveExtendedData();
        } catch (e) {
          console.error(`[RMU Comp Skills] hudDeriveExtendedData failed for ${actor.name}`, e);
          return [];
        }
      } else {
        console.warn(`[RMU Comp Skills] Token ${token.name} does not have hudDeriveExtendedData.`);
      }
    }
    
    return this._getAllActorSkills(actor);
  }
  
  /**
   * Recursively traverses the actor's skill data to produce a flat array.
   * Logic directly from skill-model.md.
   * @param {Actor} actor
   * @returns {Array<Object>}
   * @private
   */
  static _getAllActorSkills(actor) {
    const src = actor?.system?._skills; //
    if (!src) return [];
    const out = [];

    const pushMaybeSkill = (v) => {
      if (!v) return;
      if (Array.isArray(v)) {
        for (const it of v) pushMaybeSkill(it);
      } else if (typeof v === "object") {
        if (v.system && (typeof v.system === "object")) { //
          out.push(v);
        } else {
          for (const val of Object.values(v)) pushMaybeSkill(val);
        }
      }
    };
    pushMaybeSkill(src);
    return out; //
  }

  /**
   * Extracts the relevant data points from a raw skill object.
   * @param {Object} rawSkill - A skill object from _getAllActorSkills
   * @returns {{name: string, category: string, ranks: number, bonus: number, raw: Object}}
   */
  static getSkillData(rawSkill) {
    const s = rawSkill?.system ?? {};
    
    const baseName = s.name ?? "Unknown Skill";
    const specialization = s.specialization ?? null; 
    
    const fullName = (specialization && specialization.trim() !== "")
      ? `${baseName} (${specialization})`
      : baseName;

    return {
      name: fullName,
      category: s.category ?? "Unknown", //
      ranks: s._totalRanks ?? 0, //
      bonus: s._bonus ?? 0, //
      disabledBySystem: s._disableSkillRoll === true,
      raw: rawSkill,
    };
  }

  /**
   * Finds the "Leadership" skill and returns its total ranks.
   * @param {Array<Object>} rawSkills - An array of skills from _getAllActorSkills.
   * @returns {number} The total ranks in Leadership.
   */
  static getLeadershipRanks(rawSkills) {
    const leadershipSkill = rawSkills.find(sk => sk?.system?.name === "Leadership"); //
    return leadershipSkill?.system?._totalRanks ?? 0; //
  }

  /**
   * A shared sorting function that sorts by Category, then Name.
   * This matches the default RMU skill list order.
   * @param {Object} a - Skill data object
   * @param {Object} b - Skill data object
   */
  static sortSkills(a, b) {
    const categoryCompare = a.category.localeCompare(b.category);
    if (categoryCompare !== 0) return categoryCompare;
    return a.name.localeCompare(b.name);
  }

  /**
   * Groups a flat array of skill objects by category for use in <optgroup>.
   * @param {Array<object>} skills - A flat array of skill objects from getSkillData.
   * @returns {Array<{label: string, skills: Array<object>}>}
   */
  static groupSkills(skills) {
    if (!skills || skills.length === 0) return [];

    const groups = new Map();
    for (const sk of skills) {
      const category = sk.category || "Other";
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category).push(sk);
    }

    // Convert to array and sort by category label
    return Array.from(groups.entries())
      .map(([label, skills]) => ({ label, skills }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
}