# Coding Hours submission window

From **Monday 12 October 2026**, a Coding Hours assignment dated `D` counts only submissions made
**from 16:00 on `D` up to and including 15:59:59 on `D + 1`**, India time. Nothing before or after
that counts as solved, attempted or scored for it. A problem solved last week earns nothing unless
the student submits it again inside the window.

Assignments dated before 12 Oct keep the earlier rule ([HISTORICAL_SYNC.md](HISTORICAL_SYNC.md)):
no stored result changed, because the switch is by assignment date and not by when the code shipped.
Infosys Preparation and baseline tests are not affected.

## What is and is not stored

Every submission is still mirrored, exactly as before. LeetCode only exposes a student's last 20, so
history cannot be rebuilt; the window decides what is **counted**, not what is **stored**.

## Where the rule lives

One definition, `packages/shared/src/domain/submission-window.ts`, read by:

| Surface | How |
|---|---|
| Daily score, streaks, leaderboard, reports, email | `calculateAssignmentCompletion` drops out-of-window submissions before matching, so the stored `DailyStatus` / `DailyProblemStatus` follow |
| Campus Analysis | reads those same stored statuses |
| Attempts Analysis | `attemptWindows` gives a windowed day an exact 16:00 -> 15:59:59 window |
| Smoke test | `attempts-check.service.ts` re-implements the rule in SQL and must agree with the service |
| Live dashboard "proven solved" | filters by `submittedAt` inside the window |
| Sync | a submission can change the *previous* day's result too, so both days are recomputed |

## Consequences worth knowing

- **A day is final only after 15:59 the next day.** The rollup therefore runs at **17:20 IST** and the
  daily email report at **17:50 IST** (`rollup.yml`, `daily-report.yml`), after the 16:00 and 17:00 syncs.
  Before that, a day's figures are still moving.
- **Completion time is measured from when the assignment opened.** `DailyStatus.completionMinute` is
  minutes since 16:00 for windowed days (minute-of-day before), so "earlier is better" still holds
  across midnight: finishing at 17:00 that evening (60) beats 08:00 the next morning (960). The
  clock time shown to people is converted back and is unchanged. The early-finish tiers (before 9h /
  12h / 18h) and the Early Bird badge now mean hours **after the window opened** — 01:00, 04:00 and
  10:00 the next morning. Change `earlyCompletion` in the scoring config if different tiers are wanted.
- **Windows tile exactly.** The end is 15:59:59.999 and the next window opens at 16:00:00.000, so a
  submission belongs to at most one assignment day. The same problem assigned on two days has two
  separate windows.
- **`COMPLETION_RULES_VERSION` was not bumped,** on purpose: the rule changes nothing already stored.
  If the cut-over date is ever moved *earlier*, bump it then.

## Changing it

The cut-over date, opening hour and window length are constants in `submission-window.ts`; the SQL in
`attempts-check.service.ts` and the two workflow schedules must move with them. Tests:
`submission-window.spec.ts`, `assignment-completion-window.spec.ts`, and the database suite
`scoring/submission-window.e2e-spec.ts` (which also checks the service against the SQL).
