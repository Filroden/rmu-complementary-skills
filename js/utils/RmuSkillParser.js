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

    if (typeof actor.hudDeriveExtendedData === "function") {
      try {
        await actor.hudDeriveExtendedData(); //
      } catch (e) {
        console.error(`[RMU Comp Skills] hudDeriveExtendedData failed for ${actor.name}`, e);
        return [];
      }
    } else {
      console.warn(`[RMU Comp Skills] Actor ${actor.name} does not have hudDeriveExtendedData.`);
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
    return {
      name: s.name ?? "Unknown Skill", //
      category: s.category ?? "Unknown", //
      ranks: s._totalRanks ?? 0, //
      bonus: s._bonus ?? 0, //
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
}