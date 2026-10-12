#!/usr/bin/env python3
"""
Group 1 — six curriculum days per week -> five practice days per week.

The concept-session day carries no questions, so a belt-week has 5 practice days of 4
questions (20), not 6 (24). This script derives the five-day plan from the archived six-day
data (`group1.six-day.json`) and writes:

  group1.json             the five-day question bank the importer reads
  group1.selection.json   every decision, with its reason (the audit trail)

and, with --xlsx <path>, the reviewable workbook (selection log, concept check, flags,
removed questions, updated plan/summary) kept as a backup.

Method — one decision per belt-week, nothing invented, nothing outside the supplied sheet:

  * Drop exactly one day (4 questions) and keep the other five untouched: same four
    questions, same Easy -> Hard order inside the day.
  * Which day goes is judged against the Belt Concept Mapping table and the weekly session
    roadmap: a day outside the belt's listed topics (or a preview of the next belt) goes
    first; then days the roadmap marks as self-practice; then the day that most duplicates
    another. The week's challenge day is kept whenever it is in scope, so Hard problems
    are not all lost.
  * Where a week has TWO off-concept days (B4W1, B6W1) both are removed and ONE clean day is
    composed from their in-scope questions, so the week still has 5 days.
  * A few single-question swaps move a clear off-concept question out of a kept day for an
    in-concept one from a dropped day (same difficulty slot). Each is logged.

Requires: openpyxl (only for --xlsx; not a project dependency).
Run:  python3 build_five_day.py [--xlsx ~/Downloads/<name>.xlsx --master <master sheet>]
"""
import argparse, collections, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------------------------------
# Decisions. (belt, week) -> day to drop, and why.
# ---------------------------------------------------------------------------------------
DROP = {
 (1,1): (6, "Only day labelled 'preview of Belt 2': 3 of its 4 problems need loops/arrays, which Yellow Belt does not teach. Functions/return values are exercised by every problem on Days 1-5."),
 (2,1): (6, "Digit problems are listed as self-practice this week and Day 3 already covers digit extraction with while-loops; Day 6 repeats it."),
 (2,2): (6, "Challenge day drifts past elementary sorting (custom comparator 'Largest Number', greedy 'Maximum Number of Coins'). Days 1-5 cover bubble/selection/insertion, stability and selection."),
 (2,3): (4, "Digit problems belong to Week 1 (self-practice) and are not in this week's session topics; the other five days are each a required topic (GCD/LCM, primes, sieve, modular arithmetic, fast exponentiation)."),
 (3,1): (6, "Complexity growth is Week 3's topic and count-array intersections are Week 2's; Day 6 duplicates both. Days 1-5 cover traversal, rotation, shifting, dedupe/merge, rearranging."),
 (3,2): (6, "Zigzag Conversion, atoi and Integer to Roman are outside the Green Belt string topics (palindrome, anagram, reverse, basic compression). Days 1-5 cover the rest of the session."),
 (3,3): (5, "In-place updates beyond the table (Game of Life, Image Smoother). The one named table item in it, Set Matrix Zeroes, is swapped into Day 4 in place of Valid Sudoku. Day 6 (complexity growth) is kept: it is a listed topic."),
 (4,2): (1, "Easy set-membership warm-up that Day 2 and Green Belt frequency counting already cover; keeps the challenge day (Day 6) and subarray-sum hashing (Day 5)."),
 (4,3): (6, "Counting/Radix is only a short closing segment of this session, already covered by Day 5; Day 6 adds 'Top K Frequent Words' (a Red Belt heap topic) and bucket-sort extras."),
 (4,4): (1, "Easy converging-pointer warm-up that Days 2-3 already cover (opposite-direction pairs, container, trapping water); keeps the challenge day."),
 (4,5): (5, "'Count subarrays with window' (at-most-K) goes beyond the fixed/variable window the table lists; Days 1-4 and 6 cover fixed, variable and complement windows."),
 (4,6): (6, "Median of Two Sorted Arrays, Time Based Key-Value Store and K Closest Elements go beyond the table's binary-search topics. Peak element and 2D search (Days 4-5) are table topics and are kept."),
 (5,1): (6, "Rotate/split/swap/merge-in-between repeats the rewiring already practised on Days 3-4; Linked Lists is the week batches slow down on."),
 (5,2): (6, "Linked List Random Node (reservoir sampling) and LFU Cache (design) are outside Blue Belt; Day 5's Merge k Sorted Lists (a Red Belt heap topic) is swapped for an in-concept problem from this day."),
 (5,3): (4, "Calculators/path parsing (Basic Calculator II, Simplify Path) go beyond the stack topics listed; Days 1-3 and 5-6 cover matching, design, expressions and monotonic stacks."),
 (5,4): (6, "Stack parsing/calculators (two Hard) duplicate Week 3 and are not queue/deque topics; Day 5's monotonic-stack applications are a listed Blue Belt topic and stay."),
 (6,2): (6, "Repeats Day 2's merge-sort counting pattern with three more Hard variants."),
 (6,3): (5, "'Pairing & grouping after sorting' is greedy sort-and-scan, not Quick Sort/Quickselect; Days 1-2 and 6 are the quickselect days, Days 3-4 the nearest partition/sort reasoning the sheet has."),
 (6,4): (4, "String/number generation repeats the generate-all pattern of Days 1-3; Day 5 (pruning) and Day 6 (challenge) cover the rest of the backtracking topics."),
 (6,5): (4, "N-Queens and Sudoku Solver are listed as self-practice (Dojo workouts) this week, and 3 of its 4 problems are Hard."),
 (7,1): (4, "k-th-smallest-via-counting is a second technique (and includes a number-theory problem) beyond 'can we achieve target X'; Days 1-3, 5-6 cover minimize-max, maximize-min and feasibility checks."),
 (7,2): (5, "Digit/sequence greedy (Maximum Swap, Monotone Digits, Wiggle) is the least aligned to the table's sort-then-choose, scheduling, Jump Game and Gas Station."),
 (7,3): (2, "Pure greedy-on-strings is more of Week 2; this week is about choosing between binary search and greedy (Days 3, 4, 6)."),
 (8,1): (6, "Tree views and vertical order are listed as self-practice this week."),
 (8,2): (6, "Serialize/Deserialize BST is self-practice, Unique BST II is generation beyond BST operations, and LCA is covered next week."),
 (8,3): (6, "Serialize/Deserialize Binary Tree is self-practice; the rest is mixed."),
 (8,4): (5, "'Greedy + heap' (hire-K-workers, team performance, two Hard) is greedy-flavoured and beyond the heap topics the table lists."),
 (9,1): (4, "Boundary-connected regions repeat the grid-DFS pattern of Day 3."),
 (9,2): (6, "Trees-as-graphs (sub-tree label counts, apples, inform employees) are not among the cycle/bipartite/topological topics."),
 (9,3): (6, "Mixed modelling (0-1 BFS, DSU-based secret sharing) goes beyond Dijkstra/Bellman-Ford/Floyd-Warshall; algorithm selection is already Day 5."),
 (9,4): (5, "Tree-like graph traversal is BFS/DFS from Week 1, not DSU or MST."),
 (9,5): (5, "Grid simulation (Battleships, Minesweeper, Coloring a Border) is basic grid traversal from Week 1; the sheet itself notes no free problem needs Kosaraju, so the week is a capstone."),
 (10,1): (5, "Stock-buy/sell state machines are not among the DP types the table lists (1D, grid, string, knapsack, LIS, tree)."),
 (10,2): (6, "Four Hard LCS/supersequence variants that repeat Days 3-4's longest-common-subsequence and edit-distance patterns."),
 (10,3): (5, "Arithmetic/Fibonacci-like subsequences go beyond LIS; scheduling DP (Day 6) is the table's weighted-job-scheduling item and stays."),
 (10,4): (5, "Probability/board DP (Soup Servings, New 21 Game) is not among the DP types the table lists."),
 (10,5): (3, "Day 2 already carries two Hard trie problems; Day 3 adds two more Hard (Palindrome Pairs, Prefix Scores). Tries get Days 1-2, bit manipulation Days 4-6."),
 (10,6): (6, "Randomised/frequency design (Random Pick with Weight, All O`one) is not a Black Belt topic and has two Hard. Day 5 (hash-map design) is kept only because the sheet has too few free KMP/Rabin-Karp problems to fill five days."),
}

# Two weeks have two off-concept days: both go, one clean day is composed from in-scope questions.
COMPOSED = {
 (4,1): dict(
   remove_days=[5,6],
   take=[(6,1),(5,2),(5,3),(5,1)],      # (orig day, orig position) in order
   focus="Challenge: prefix sums beyond basic range queries",
   reason="Days 5-6 are almost entirely 2D prefix sums / difference arrays, which Purple Belt (1D prefix/suffix sums, prefix XOR) does not list. One clean challenge day is composed from the in-scope questions: Minimum Value to Get Positive Step by Step Sum and the two 1D difference-array problems (Corporate Flight Bookings, Car Pooling). Range Sum Query 2D is the closest in-family fourth problem and is flagged."),
 (6,1): dict(
   remove_days=[5,6],
   take=[(6,2),(5,2),(6,1),(5,1)],
   focus="Challenge: recursion on numbers, generated strings and nested structures",
   reason="Days 5-6 are recursive parsing, bit tricks and special strings (four of eight are Hard) beyond Brown Belt's recursion basics. One challenge day is composed from the Medium recursion/backtracking problems of both; the Hard parsing/bit problems are removed."),
}

# Single-question swaps: (belt, week, (day_a, pos_a), (day_b, pos_b)) exchange two questions.
SWAPS = [
 (1,1,(3,2),(6,1),"Minimum Time Visiting All Points iterates an array of points (arrays/loops are Orange/Green Belt); Account Balance After Rounded Purchase is pure arithmetic + a condition, which is Yellow Belt."),
 (3,3,(4,4),(5,2),"Valid Sudoku is a hash-set validity problem outside Green Belt; Set Matrix Zeroes is the table's named matrix item."),
 (5,2,(5,4),(6,2),"Merge k Sorted Lists is a Red Belt heap topic; Reverse Nodes in Even Length Groups is plain Blue Belt pointer manipulation."),
]

# Question-level flags that remain after selection: (belt, week, LeetCode #, note).
FLAGS = [
 (1,1,412,"Fizz Buzz returns a list so it needs a loop (taught in Orange); kept because it is the canonical if-else-ladder exercise."),
 (1,1,3200,"Maximum Height of a Triangle is solved with a small loop; no loop-free replacement exists in the sheet."),
 (1,1,2733,"Neither Minimum nor Maximum takes an array input; the logic is conditionals only."),
 (4,1,304,"Range Sum Query 2D is a 2D prefix sum, one step beyond the 1D prefix sums the table lists; closest in-family fourth problem for the composed day."),
 (4,1,1109,"Corporate Flight Bookings uses a difference array (the inverse of a prefix sum), not named in the table."),
 (4,1,1094,"Car Pooling uses a difference array (the inverse of a prefix sum), not named in the table."),
 (4,2,347,"Top K Frequent Elements is also a Red Belt heap topic; here it is solvable with hashing + sort/bucket."),
 (5,2,146,"LRU Cache is hash map + doubly linked list (design); in-belt but design-flavoured."),
 (6,3,611,"Valid Triangle Number is sort + two pointers, not Quick Sort/Quickselect; the sheet has no further pure Quick Sort problems."),
 (6,3,2971,"Find Polygon With the Largest Perimeter is sort + scan, not Quick Sort/Quickselect."),
 (6,5,131,"Palindrome Partitioning is listed as self-practice (Dojo workout) this week."),
 (10,6,705,"Design HashSet/HashMap are hash-table design (Purple Belt hashing), not KMP/Rabin-Karp; kept to fill five days."),
 (10,6,706,"Design HashSet/HashMap are hash-table design (Purple Belt hashing), not KMP/Rabin-Karp; kept to fill five days."),
 (10,6,380,"Insert Delete GetRandom O(1) is hash + array design, not KMP/Rabin-Karp; kept to fill five days."),
 (10,6,1396,"Design Underground System is hash-map design, not KMP/Rabin-Karp; kept to fill five days."),
]

# Table topics with no (or thin) coverage in the sheet — reported, never invented.
GAPS = [
 (1,"5. Functions & Parameter Passing","No dedicated day after Day 6 was removed; every problem is written as a function with parameters and a return value, and scope / pass-by-value belong to the weekly session."),
 (3,"2. Strings — basic compression ('aaabbc' -> 'a3b2c1')","The sheet has no String Compression problem (LeetCode 443); the only compression-labelled day was the removed Day 6, whose problems did not cover it. Consider adding #443."),
 (4,"3. Hashing — longest substring without repeating characters; first non-repeating character","Neither sits in Week 2; the former is a sliding-window classic and the latter appears in Green Belt (#387)."),
 (6,"3. Divide & Conquer — Quick Sort partitioning","The sheet has no problem that needs Quick Sort partitioning itself; Week 3 uses Quickselect and sort-based reasoning."),
 (9,"9. Strongly Connected Components (Kosaraju's)","No free LeetCode problem needs Kosaraju; Week 5 uses directed-cycle problems for SCC intuition (as the sheet's own notes say)."),
 (10,"6. String Matching (KMP / Rabin-Karp)","Free KMP/Rabin-Karp problems are scarce: Days 1-4 cover them, Day 5 is hash-map design filler."),
]


def load():
    g = json.load(open(os.path.join(HERE, "group1.six-day.json")))
    by = collections.defaultdict(dict)
    for r in g:
        by[(r["belt"], r["week"])][(r["day"], r["position"])] = dict(r)
    return g, by


def build(by):
    out, log, removed = [], [], []
    for (belt, week) in sorted(by):
        rows = by[(belt, week)]
        # --- swaps -----------------------------------------------------------------
        swaps_here = [s for s in SWAPS if s[0] == belt and s[1] == week]
        for _, _, a, b, why in swaps_here:
            rows[a], rows[b] = rows[b], rows[a]
        # --- which days survive ------------------------------------------------------
        comp = COMPOSED.get((belt, week))
        if comp:
            gone = set(comp["remove_days"])
            reason = comp["reason"]
        else:
            d, reason = DROP[(belt, week)]
            gone = {d}
        kept_days = [d for d in range(1, 7) if d not in gone]
        day_rows = {d: [rows[(d, p)] for p in range(1, 5)] for d in range(1, 7)}
        plan = []  # list of (focus, [rows])
        for d in kept_days:
            plan.append((day_rows[d][0]["dayFocus"], day_rows[d], d))
        if comp:
            picked = [rows[t] for t in comp["take"]]
            picked.sort(key=lambda r: ("EMH".index(r["difficulty"][0]), r["position"]))
            plan.append((comp["focus"], picked, "composed"))
        assert len(plan) == 5, (belt, week, len(plan))
        used = set()
        for new_day, (focus, qs, origin) in enumerate(plan, start=1):
            for pos, r in enumerate(qs, start=1):
                n = dict(r)
                n["originalDay"], n["originalPosition"] = r["day"], r["position"]
                n["day"], n["position"] = new_day, pos
                n["dayFocus"] = focus
                n["usage"] = f"Belt {belt} Week {week} Day {new_day} Q{pos}"
                out.append(n)
                used.add((r["leetcodeNumber"]))
        for (d, p), r in rows.items():
            if r["leetcodeNumber"] not in used:
                removed.append(dict(r, reason=reason))
        log.append(dict(belt=belt, week=week, droppedDays=sorted(gone), composed=bool(comp), reason=reason,
                        swaps=[dict(out=s[2], inn=s[3], why=s[4]) for s in swaps_here]))
    return out, log, removed


def validate(out, original):
    problems = []
    by = collections.defaultdict(list)
    for r in out:
        by[(r["belt"], r["week"], r["day"])].append(r)
    weeks = collections.Counter((k[0], k[1]) for k in by)
    for wk, n in weeks.items():
        if n != 5: problems.append(f"{wk}: {n} days")
    for k, qs in by.items():
        if sorted(q["position"] for q in qs) != [1, 2, 3, 4]: problems.append(f"{k}: slots")
        diffs = ["EMH".index(q["difficulty"][0]) for q in sorted(qs, key=lambda q: q["position"])]
        if diffs != sorted(diffs): problems.append(f"{k}: not Easy->Hard {diffs}")
        if k[0] <= 3 and any(q["difficulty"] == "Hard" for q in qs): problems.append(f"{k}: Hard in belts 1-3")
    nums = [r["leetcodeNumber"] for r in out]
    if len(nums) != len(set(nums)): problems.append("duplicate LeetCode #")
    orig = {r["leetcodeNumber"] for r in original}
    if not set(nums) <= orig: problems.append("question not in the original sheet")
    if len(out) != 800: problems.append(f"{len(out)} rows, expected 800")
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx"); ap.add_argument("--master")
    args = ap.parse_args()
    original, by = load()
    out, log, removed = build(by)
    problems = validate(out, original)
    if problems:
        print("VALIDATION FAILED:"); [print(" ", p) for p in problems]; sys.exit(1)
    out.sort(key=lambda r: (r["belt"], r["week"], r["day"], r["position"]))
    json.dump(out, open(os.path.join(HERE, "group1.json"), "w"), indent=1, ensure_ascii=False); open(os.path.join(HERE, "group1.json"), "a").write("\n")
    json.dump(dict(log=log, flags=[dict(belt=b, week=w, leetcodeNumber=n, note=t) for b, w, n, t in FLAGS],
                   gaps=[dict(belt=b, topic=t, note=n) for b, t, n in GAPS], removed=len(removed)),
              open(os.path.join(HERE, "group1.selection.json"), "w"), indent=1, ensure_ascii=False)
    print(f"group1.json: {len(out)} rows, {len({(r['belt'],r['week'],r['day']) for r in out})} days; removed {len(removed)} questions; validation OK")
    if args.xlsx:
        import xlsx_report
        xlsx_report.write(args.xlsx, args.master, original, out, log, removed, FLAGS, GAPS)


if __name__ == "__main__":
    main()
