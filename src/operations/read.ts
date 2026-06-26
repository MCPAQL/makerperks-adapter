// CRUDE READ family over the directory: list_programs / get_program / search_programs.
// Results carry decision signal (value, audience, eligibility, verified, redemption URL).
// See docs/ARCHITECTURE.md §1 and the directory-query spec.

import type { Router } from "../core/router.js";
import type { DataSource } from "../data/source.js";

// TODO(tasks 3.2-3.4): register list_programs, get_program, search_programs (fuzzy via fuse.js).
export function registerReadOperations(_router: Router, _data: DataSource): void {
  throw new Error("not implemented (task 3.2)");
}
