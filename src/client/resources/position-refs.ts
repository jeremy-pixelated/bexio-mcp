/**
 * Internal helper shared by {@link QuotesApi} and {@link OrdersApi} for the
 * "create invoice/order/delivery from quote/order" endpoints.
 *
 * Not re-exported from `client/index.ts` (unlike the rest of `resources/`,
 * which is barrel-exported via `export *`) — this is implementation plumbing
 * for those two resource classes, not public API, the same way
 * `POSITION_KIND_SEGMENTS` in `sales-docs.ts` stays module-private.
 */

/** A `{id, type, amount}` reference to a position of a source document. */
export interface PositionReference {
  id: number;
  type: string;
  amount?: number;
}

/**
 * Builds the `positions` references to send when a "create invoice/order from
 * quote/order" call omits `positions`.
 *
 * The bexio OpenAPI spec documents `positions` as optional on these endpoints
 * ("omit to take over all positions of the source document"), but the live
 * API rejects the resulting empty body with a 415 ("Could not parse the
 * data."). Sending an explicit reference for every position of the source
 * document (as returned by its `get`/`show` endpoint) works instead, so
 * callers that omit `positions` fetch the source document first and pass
 * this through as the reference list. Live-verified for quote→invoice only
 * (25.09.2026); quote→order, order→invoice and order→delivery use the same
 * code path by symmetry but have not themselves been exercised against the
 * live API.
 *
 * Every position is included (text, pagebreak, subpositions and their child
 * positions), not just article/custom ones, to preserve the source
 * document's structure — the API returns positions as a flat list with
 * `parent_id` linking children to their subposition, so no tree-walking is
 * needed. `amount` is carried over as a number where the source position has
 * one (article/custom/subposition-child positions); kinds without an amount
 * (text, subtotal, pagebreak, discount) are referenced by `id`/`type` alone.
 */
export function positionsToReferences(
  positions: ReadonlyArray<Record<string, unknown>> | undefined,
): PositionReference[] {
  if (!positions || positions.length === 0) return [];
  const refs: PositionReference[] = [];
  for (const position of positions) {
    const id = position.id;
    const type = position.type;
    if (typeof id !== 'number' || typeof type !== 'string') continue;
    const ref: PositionReference = { id, type };
    const amount = position.amount;
    if (typeof amount === 'number') {
      ref.amount = amount;
    } else if (typeof amount === 'string' && amount.trim() !== '') {
      const parsed = Number(amount);
      if (Number.isFinite(parsed)) ref.amount = parsed;
    }
    refs.push(ref);
  }
  return refs;
}
