# KK26 Participatory Budgeting — Methodology Context

This document explains how the KK26 vote was conducted, how responses were processed, and how the two funding methods (MES and Greedy) work and compare.

---

## 1. How People Voted

Each voter was presented with a list of project proposals and asked to rate each one on a **4-point scale**:

| Vote Label | Meaning |
| :--- | :--- |
| **Ja** | Yes — I support this project |
| **EherJa** | Rather yes — I lean towards supporting it |
| **EherNein** | Rather no — I lean against it |
| **Nein** | No — I do not support this project |

Voters could also leave **written comments** on individual projects, which were used to generate qualitative summaries.

---

## 2. Group Allocation & Budgets

Voters were split into three groups. To ensure fairness, each voter received an equal share of the total budget (~7,000 CHF per voter):

| Group | Voters | Budget |
| :--- | :--- | :--- |
| **ROT** | 7 | 49,000 CHF |
| **SCHWARZ** | 7 | 49,000 CHF |
| **BLAU** | 9 | 63,000 CHF |

**Total budget across all groups: 161,000 CHF**

---

## 3. Vote Conversion

Raw vote labels were converted into two numeric scales used by the algorithms:

### Utility Score (used by MES)

This scale captures whether a voter *actively supports* a project (i.e., would want their budget share spent on it):

| Vote | Utility |
| :--- | :--- |
| Ja | 2 |
| EherJa | 1 |
| EherNein | 0 |
| Nein | 0 |

> Negative votes carry zero utility — they mean absence of support, not active opposition, for the purpose of budget allocation.

### Mean Score (used for ranking and tie-breaking)

This scale captures the full sentiment including opposition, and is used to rank projects and break ties:

| Vote | Score |
| :--- | :--- |
| Ja | +2 |
| EherJa | +1 |
| EherNein | −1 |
| Nein | −2 |

The **Mean Score** per project is the average of all voters' score values (including non-supporters).

---

## 4. Method of Equal Shares (MES)

MES is a **fairness-first** algorithm. It distributes the budget so that each voter's preferences are represented proportionally.

### How it works

1. Each voter starts with an equal wallet: `budget ÷ number of voters` (e.g., 7,000 CHF per voter in ROT/SCHWARZ).
2. Projects are selected iteratively. At each step, the algorithm finds the project with the best **effective vote count** — a measure of how many utility-weighted votes are "behind" the project, adjusted for what supporters can still afford.
3. The cost of a funded project is **split among its supporters**, proportional to their utility scores. Supporters with less remaining budget pay less.
4. A project can only be funded if its supporters collectively have enough remaining budget to cover its cost.
5. The process stops when no remaining project can be funded under these constraints.

### Budget completion (add1 loop)

The basic MES round often ends with some budget unspent, because supporters' wallets have been emptied unevenly. To get closer to the target budget, the algorithm runs an **add1 completion loop**:

- It incrementally raises the virtual per-voter budget by 1 CHF at a time and re-runs MES.
- It continues as long as the resulting total spend stays within the real budget.
- If the next increment would push spending *over* the budget, it picks the closer result: **if the overshoot is smaller than the current undershoot, the higher allocation is used**.

### What MES optimises

MES is designed so that **every voter's share of the budget is spent on projects they support**. Voters who hold minority preferences are not drowned out by the majority — their share can fund smaller or niche projects they rated highly.

---

## 5. Greedy (Popularity Vote)

The Greedy method simulates a **simple popularity vote**: it funds whatever projects have the most support, in order, until the budget runs out.

### How it works

1. Projects are sorted by **Mean Score** (descending). Ties are broken alphabetically by Project ID.
2. Projects are selected one by one in score order, adding each to the funded list if it fits within the remaining budget.
3. **Hard stop**: the algorithm stops at the *first* project that doesn't fit — it does not skip over expensive projects to pick cheaper low-scored ones.
4. **Completion step** (mirrors MES): if the next project (the one that didn't fit) would overshoot by *less* than the current undershoot, it is included anyway — the closer result wins.

### What Greedy optimises

Greedy maximises **aggregate popularity**: projects liked by the most voters (with the highest average score) are funded first. It does not account for minority preferences or whether individual voters' budget shares are spent fairly.

---

## 6. Comparing the Two Methods

| | MES | Greedy |
| :--- | :--- | :--- |
| **Optimises** | Fairness per voter | Aggregate popularity |
| **Budget unit** | Per-voter wallet | Shared pool |
| **Stopping rule** | Supporters can no longer collectively afford any project | Next-best project doesn't fit (+ completion check) |
| **Minority preferences** | Protected | Can be overridden by majority |
| **Budget completeness** | Closest achievable via add1 loop | Closest achievable via single completion step |

> **Why they differ:** MES may fund a niche project strongly supported by a small group (their wallets are large enough to cover their share), while Greedy funds the most broadly popular projects regardless of whether supporters' shares have already been spent.

---

## 7. Outputs

| File | Description |
| :--- | :--- |
| `KK26_Outcome_{GROUP}.csv` | Per-project results: MES/Greedy winner, scores, rationale |
| `KK26_Receipts_{GROUP}.csv` | Per-voter budget receipts: how much each voter paid per funded project |
| `Summary_{GROUP}.md` | Human-readable group report with LLM-generated narrative |
| `Summary_OVERALL.md` | Combined report across all three groups |

---

## 8. Narrative Generation

The summary reports include short narrative paragraphs generated by **GPT-5.1**. The LLM is given:
- All key stats (voters, budgets, spend, project lists)
- MES mechanics context (equal share, wallet depletion logic)
- Specific data hints (gap remaining, unfunded popular projects, per-voter wallet size)

It generates three sections per group: an **overview**, a **budget explanation** (grounded in MES logic), and a **fairness vs. popularity comparison**. All text is produced in both Swiss Standard German and English.
