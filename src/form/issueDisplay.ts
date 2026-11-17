/**
 * Where a form shows a problem no field on screen can show (no field, or its field is not mounted):
 * `header`, a strip at the top of the form (default), or `toast`, the floating messages. One switch
 * for every DeskForm.
 */
export type DeskUnplacedIssueDisplay = 'header' | 'toast';
export const DESK_UNPLACED_ISSUES: DeskUnplacedIssueDisplay = 'header';
