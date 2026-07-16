function normalize(s) {
  return String(s || '').trim().toLowerCase();
}

function arraySetDiff(oldArr = [], newArr = [], keyFn = normalize) {
  const oldKeys = new Set(oldArr.map(keyFn));
  const newKeys = new Set(newArr.map(keyFn));
  return {
    added: newArr.filter(item => !oldKeys.has(keyFn(item))),
    removed: oldArr.filter(item => !newKeys.has(keyFn(item))),
  };
}

// oldTerms/newTerms: { shared_goals, penalty_amount, user_a_rules, user_b_rules, special_allowances }
// Returns null if oldTerms is null/undefined — nothing to diff against (first-ever proposal).
export function computeTermsDiff(oldTerms, newTerms) {
  if (!oldTerms) return null;

  const goals = arraySetDiff(oldTerms.shared_goals || [], newTerms.shared_goals || [], s => s.trim());
  const rulesA = arraySetDiff(oldTerms.user_a_rules || [], newTerms.user_a_rules || [], normalize);
  const rulesB = arraySetDiff(oldTerms.user_b_rules || [], newTerms.user_b_rules || [], normalize);
  const allowances = arraySetDiff(oldTerms.special_allowances || [], newTerms.special_allowances || [], a => normalize(a?.name));

  const oldPenalty = Number(oldTerms.penalty_amount) || 0;
  const newPenalty = Number(newTerms.penalty_amount) || 0;
  const penaltyChanged = oldPenalty !== newPenalty ? { from: oldPenalty, to: newPenalty } : null;

  const hasChanges = !!(
    goals.added.length || goals.removed.length ||
    rulesA.added.length || rulesA.removed.length ||
    rulesB.added.length || rulesB.removed.length ||
    allowances.added.length || allowances.removed.length ||
    penaltyChanged
  );

  return {
    goalsAdded: goals.added, goalsRemoved: goals.removed,
    rulesAddedA: rulesA.added, rulesRemovedA: rulesA.removed,
    rulesAddedB: rulesB.added, rulesRemovedB: rulesB.removed,
    allowancesAdded: allowances.added, allowancesRemoved: allowances.removed,
    penaltyChanged,
    hasChanges,
  };
}
