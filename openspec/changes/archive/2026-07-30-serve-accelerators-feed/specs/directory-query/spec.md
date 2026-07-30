# directory-query

## ADDED Requirements

### Requirement: Deadline-window query

The READ endpoint family SHALL provide an `upcoming_deadlines` operation returning
programs whose `next_deadline` falls within a requested day window (default 60 days),
sorted soonest-first, each with the days remaining computed against the current date;
past deadlines SHALL be excluded. Programs that explicitly declare `next_deadline:
null` SHALL be reported separately as rolling (apply-anytime); programs whose feed
does not carry the `next_deadline` field at all SHALL NOT appear in either list. The
operation SHALL support restricting to one feed and excluding the rolling list.

#### Scenario: Deadlines inside the window, soonest first

- **WHEN** a client issues `upcoming_deadlines` with a window covering two dated
  programs and not a third
- **THEN** the two in-window programs are returned soonest-first with their
  `days_left`, and the third is absent

#### Scenario: Rolling is explicit, not inferred from absence

- **WHEN** the directory federates a feed with explicit `next_deadline: null`
  programs and a feed (e.g. perks) whose programs lack the field
- **THEN** the explicit-null programs appear under `rolling` and the field-less
  programs appear nowhere in the result

#### Scenario: Past deadlines are excluded

- **WHEN** a program's `next_deadline` is before the current date
- **THEN** it is not returned, whatever the window
