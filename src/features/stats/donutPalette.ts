/**
 * Validated categorical palette for the category donut (dark, CVD-ordered — see
 * the dataviz skill): the top categories take distinct slots, everything else
 * folds into one neutral "Other" slice. Kept apart from the component so both it
 * and Stats can import without tripping fast-refresh.
 */
export const SLICE_COLORS = ["#3987e5", "#199e70", "#c98500", "#008300", "#9085e9", "#e66767"];
export const OTHER_COLOR = "#64748b"; // slate-500

export interface Slice {
  label: string;
  value: number;
  color: string;
}
