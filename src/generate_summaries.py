import pandas as pd
import os
import json
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def get_report_narrative(group, stats, mes_only, greedy_only, unfunded_popular):
    """
    Uses gpt-5.1 to generate a human-centric narrative for the group summary.
    """
    prompt = f"""
    Study these voting results for group {group} and explain what happened in a simple, direct way.
    
    Data:
    - {stats['num_voters']} citizens voted.
    - Target Budget: {stats['budget']} CHF.
    - Final Allocation: {stats['mes_spend']} CHF.
    - MES (Fairness) funded {stats['num_mes']} projects.
    - Simple popularity vote would have funded {stats['num_greedy']} projects.
    
    Projects that differ between the two approaches:
    - Only MES funded: {', '.join([f"{p['title']} ({p['cost']} CHF)" for p in mes_only]) if mes_only else 'None'}
    - Only Greedy funded: {', '.join([f"{p['title']} ({p['cost']} CHF)" for p in greedy_only]) if greedy_only else 'None'}
    - High popularity but not funded: {', '.join([f"{p['title']} ({p['cost']} CHF)" for p in unfunded_popular]) if unfunded_popular else 'None'}
    
    Write three short paragraphs in a friendly, direct tone (no jargon, no "audit" language):
    1. overview: What happened overall in this group — which projects got funded, what was the mood?
    2. budget: Using your understanding of MES, explain why the process stopped at {stats['mes_spend']} CHF.
       Reason from the data — consider:
       - Each voter had a wallet of {stats['budget'] / stats['num_voters']:,.0f} CHF ({stats['budget']:,} ÷ {stats['num_voters']} voters).
       - Remaining unspent gap: {stats['budget'] - stats['mes_spend']:,} CHF.
       - Unfunded but popular projects: {', '.join([f"{p['title']} ({p['cost']} CHF)" for p in unfunded_popular]) if unfunded_popular else 'None'}.
       - Could supporters of those projects still afford their equal share, or had they already spent it on earlier projects? Use this to explain the stopping point.
    3. diff: Why did MES and Greedy make different choices? Use the specific project names above to explain.
    
    Return JSON only:
    {{"overview_de": "...", "overview_en": "...", "budget_de": "...", "budget_en": "...", "diff_de": "...", "diff_en": "..."}}
    """
    try:
        response = client.chat.completions.create(
            model="gpt-5.1",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You write short, honest summaries for people who participated in a vote. Be specific, friendly, and avoid jargon. Use Swiss Standard German (no 'ß') and clear English.\n\nMES (Method of Equal Shares) mechanics you must understand to explain the budget correctly:\n- Each voter starts with an equal share of the total budget (budget ÷ number of voters).\n- Projects are funded iteratively: the cost of each project is split equally among its supporters.\n- A project can only be funded if its supporters still have enough in their individual wallets to cover their share of the cost.\n- The process stops when no remaining project can be funded this way — either because supporters have spent their wallet, or the project cost exceeds what the remaining supporters can collectively pay.\n- The final spend is therefore always ≤ the target budget; the gap is the leftover that could not be allocated fairly."},
                {"role": "user", "content": prompt}
            ]
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"  !!! GPT-5.1 API Error: {e}")
        return {}


def generate_reports():
    groups = {
        "ROT": 49000,
        "SCHWARZ": 49000,
        "BLAU": 63000
    }
    output_dir = "kk26_voting/reports/"
    os.makedirs(output_dir, exist_ok=True)

    print("\n" + "=" * 50)
    print("STARTING: Summary Report Generation")
    print("=" * 50)

    for group, budget in groups.items():
        print(f"\n[{group}] STEP 1: Loading CSV files...")

        outcome_file = f"kk26_voting/csv/KK26_Outcome_{group}.csv"
        receipts_file = f"kk26_voting/csv/KK26_Receipts_{group}.csv"

        if not os.path.exists(outcome_file) or not os.path.exists(receipts_file):
            print(f"  FAILED: Missing files for {group}. Skipping.")
            continue

        df_out = pd.read_csv(outcome_file)
        df_rec = pd.read_csv(receipts_file)
        print(f"  OK: Loaded {len(df_out)} projects, {df_rec['Voter_ID'].nunique()} voters.")

        print(f"[{group}] STEP 2: Computing stats...")
        num_voters = df_rec['Voter_ID'].nunique()
        mes_winners = df_out[df_out['MES_Winner'] == 'Yes']
        greedy_winners = df_out[df_out['Greedy_Winner'] == 'Yes']
        mes_spend = mes_winners['Cost_CHF'].sum()
        greedy_spend = greedy_winners['Cost_CHF'].sum()
        rem_budget_mes = budget - mes_spend
        rem_budget_greedy = budget - greedy_spend

        # --- Greedy stopping step info ---
        df_sorted_greedy = df_out.sort_values(['Mean_Score', 'Project_ID'], ascending=[False, True])
        g_cost_sim = 0
        greedy_stop_project = None
        greedy_undershoot_before_stop = None
        for _, row in df_sorted_greedy.iterrows():
            if g_cost_sim + row['Cost_CHF'] <= budget:
                g_cost_sim += row['Cost_CHF']
            else:
                greedy_stop_project = row
                greedy_undershoot_before_stop = budget - g_cost_sim
                break

        mes_only_data = (df_out[(df_out['MES_Winner'] == 'Yes') & (df_out['Greedy_Winner'] == 'No')]
                         [['Title', 'Cost_CHF']].rename(columns={'Title': 'title', 'Cost_CHF': 'cost'}).to_dict('records'))
        greedy_only_data = (df_out[(df_out['MES_Winner'] == 'No') & (df_out['Greedy_Winner'] == 'Yes')]
                            [['Title', 'Cost_CHF', 'Mean_Score']].rename(columns={'Title': 'title', 'Cost_CHF': 'cost', 'Mean_Score': 'score'}).to_dict('records'))
        unfunded_popular = (df_out[(df_out['MES_Winner'] == 'No') & (df_out['Mean_Score'] > 0.5)]
                            .sort_values('Mean_Score', ascending=False).head(3)
                            [['Title', 'Cost_CHF', 'Mean_Score']].rename(columns={'Title': 'title', 'Cost_CHF': 'cost', 'Mean_Score': 'score'}).to_dict('records'))

        stats = {
            'num_voters': num_voters, 'budget': budget,
            'mes_spend': mes_spend, 'num_mes': len(mes_winners), 'num_greedy': len(greedy_winners)
        }
        print(f"  OK: MES spent {mes_spend:,} CHF ({len(mes_winners)} projects). Greedy spent {greedy_spend:,} CHF ({len(greedy_winners)} projects).")

        print(f"[{group}] STEP 3: Calling GPT-5.1 for narrative (may take ~20s)...")
        narrative = get_report_narrative(group, stats, mes_only_data[:3], greedy_only_data[:3], unfunded_popular)

        if narrative:
            print(f"  OK: Narrative received.")
        else:
            print(f"  WARNING: No narrative returned. Report will have missing text.")

        average_spend = df_rec[df_rec['Funded'] == 'Yes']['Amount_Paid_CHF'].sum() / num_voters

        # --- Build funded project rows ---
        mes_rows = ""
        for i, (_, row) in enumerate(mes_winners.iterrows(), start=1):
            mes_rows += f"| {i} | {int(row['Project_ID']):03d} | {row['Title']} | {row['Cost_CHF']:,} CHF | {row['Mean_Score']:.2f} | {int(row['Support_Count'])} |\n"

        greedy_rows = ""
        for i, (_, row) in enumerate(greedy_winners.sort_values('Mean_Score', ascending=False).iterrows(), start=1):
            greedy_rows += f"| {i} | {int(row['Project_ID']):03d} | {row['Title']} | {row['Cost_CHF']:,} CHF | {row['Mean_Score']:.2f} | {int(row['Support_Count'])} |\n"

        # --- MES stopping step ---
        mes_variance_str = f"{abs(rem_budget_mes):,.0f} CHF {'over budget' if rem_budget_mes < 0 else 'unspent'}"

        # --- Greedy stopping step ---
        if greedy_stop_project is not None:
            greedy_stop_cost = int(greedy_stop_project['Cost_CHF'])
            greedy_overshoot = greedy_stop_cost - greedy_undershoot_before_stop
            if rem_budget_greedy < 0:
                # completion step was triggered (went over)
                greedy_stop_str = (f"Next project **{greedy_stop_project['Title']}** ({greedy_stop_cost:,} CHF) "
                                   f"would overshoot by {greedy_overshoot:,} CHF — "
                                   f"less than the {greedy_undershoot_before_stop:,} CHF gap, so it was included.")
            else:
                greedy_stop_str = (f"Next project **{greedy_stop_project['Title']}** ({greedy_stop_cost:,} CHF) "
                                   f"would overshoot by {greedy_overshoot:,} CHF — "
                                   f"more than the {greedy_undershoot_before_stop:,} CHF gap, so it was excluded. "
                                   f"{abs(rem_budget_greedy):,.0f} CHF left unspent.")
        else:
            greedy_stop_str = "All projects funded — budget fully allocated."

        print(f"[{group}] STEP 4: Writing markdown file...")
        report_content = f"""# Result Summary: Group {group}

| | MES (Fairness) | Greedy (Popularity) |
| :--- | :--- | :--- |
| **Projects Funded** | {len(mes_winners)} | {len(greedy_winners)} |
| **Total Spend** | {mes_spend:,} CHF | {greedy_spend:,} CHF |
| **vs. Budget ({budget:,} CHF)** | {abs(rem_budget_mes):,.0f} CHF {'over' if rem_budget_mes < 0 else 'under'} | {abs(rem_budget_greedy):,.0f} CHF {'over' if rem_budget_greedy < 0 else 'under'} |
| **Participants** | {num_voters} voters | — |

### ✅ Funded by MES (Fairness)

| # | ID | Project | Cost | Score | Supporters |
| :--- | :--- | :--- | :--- | :--- | :--- |
{mes_rows}
**MES stopping point:** {mes_variance_str} remaining after last funded project. Next unfunded popular projects: {', '.join([f"{p['title']} ({p['cost']:,} CHF)" for p in unfunded_popular]) if unfunded_popular else 'none'}

### 📊 Funded by Greedy (Popularity)

| # | ID | Project | Cost | Score | Supporters |
| :--- | :--- | :--- | :--- | :--- | :--- |
{greedy_rows}
**Greedy stopping point:** {greedy_stop_str}

---

{narrative.get('overview_de', '')}

*{narrative.get('overview_en', '')}*

---

## ⚖️ Where Fairness and Popularity Differed

{narrative.get('diff_de', '')}

*{narrative.get('diff_en', '')}*

| Project | Cost | Score | Funded by |
| :--- | :--- | :--- | :--- |
"""
        diff_df = df_out[(df_out['MES_Winner'] != df_out['Greedy_Winner'])].head(10)
        for _, row in diff_df.iterrows():
            res = "Fairness (MES)" if row['MES_Winner'] == 'Yes' else "Popularity (Greedy)"
            report_content += f"| {row['Title']} | {row['Cost_CHF']:,} | {row['Mean_Score']:.2f} | {res} |\n"

        report_content += f"""
---

## 💰 Budget: Why Did We Stop at {mes_spend:,} CHF?

{narrative.get('budget_de', '')}

*{narrative.get('budget_en', '')}*

- **Average spent per voter**: {average_spend:,.2f} CHF

"""

        out_path = f"{output_dir}Summary_{group}.md"
        with open(out_path, "w") as f:
            f.write(report_content)
        print(f"  OK: Saved to {out_path}")


    print("\n" + "=" * 50)
    print("DONE: All group reports generated.")
    print("=" * 50)


def get_overall_narrative(all_groups_data):
    """
    Uses gpt-5.1 to generate a cross-group interpretive narrative.
    """
    group_summaries = "\n".join([
        f"- Group {d['group']}: {d['num_voters']} voters, budget {d['budget']:,} CHF, "
        f"spent {d['mes_spend']:,} CHF ({d['num_mes']} projects funded by MES, {d['num_greedy']} by popularity vote). "
        f"Unspent: {d['budget'] - d['mes_spend']:,} CHF."
        for d in all_groups_data
    ])
    all_winners = "\n".join([
        f"Group {d['group']}: " + ", ".join([f"{p['title']} ({p['cost']:,} CHF)" for p in d['winners']])
        for d in all_groups_data
    ])
    total_budget = sum(d['budget'] for d in all_groups_data)
    total_spend = sum(d['mes_spend'] for d in all_groups_data)
    total_voters = sum(d['num_voters'] for d in all_groups_data)
    total_projects = sum(d['num_mes'] for d in all_groups_data)

    prompt = f"""
    You are summarising a participatory budgeting vote across three citizen groups.
    The method used is MES (Method of Equal Shares).

    Overall figures:
    - Total voters: {total_voters}
    - Total budget: {total_budget:,} CHF
    - Total MES allocation: {total_spend:,} CHF
    - Total projects funded: {total_projects}
    - Total unspent: {total_budget - total_spend:,} CHF

    Per-group breakdown:
    {group_summaries}

    Funded projects per group:
    {all_winners}

    Write three short, friendly paragraphs (no jargon, no audit language):
    1. overall: What was the big picture — what kinds of projects won, what do the results say about participants' priorities?
    2. fairness: How did MES shape the outcome compared to a simple popularity vote? Any notable differences across groups?
    3. takeaway: The single clearest insight a reader should take away from this vote.

    Return JSON only:
    {{"overall_de": "...", "overall_en": "...", "fairness_de": "...", "fairness_en": "...", "takeaway_de": "...", "takeaway_en": "..."}}
    """
    try:
        response = client.chat.completions.create(
            model="gpt-5.1",
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You write clear, honest summaries for people who participated in a vote. Be specific and friendly. Use Swiss Standard German (no '\u00df') and clear English."},
                {"role": "user", "content": prompt}
            ]
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"  !!! GPT-5.1 API Error: {e}")
        return {}


def generate_overall_summary():
    groups = {
        "ROT": 49000,
        "SCHWARZ": 49000,
        "BLAU": 63000
    }
    output_dir = "kk26_voting/reports/"

    print("\n" + "=" * 50)
    print("STARTING: Overall Combined Summary")
    print("=" * 50)

    all_groups_data = []

    for group, budget in groups.items():
        outcome_file = f"kk26_voting/csv/KK26_Outcome_{group}.csv"
        receipts_file = f"kk26_voting/csv/KK26_Receipts_{group}.csv"
        if not os.path.exists(outcome_file) or not os.path.exists(receipts_file):
            print(f"  FAILED: Missing files for {group}. Skipping.")
            continue

        df_out = pd.read_csv(outcome_file)
        df_rec = pd.read_csv(receipts_file)
        num_voters = df_rec['Voter_ID'].nunique()
        mes_winners = df_out[df_out['MES_Winner'] == 'Yes']
        greedy_winners = df_out[df_out['Greedy_Winner'] == 'Yes']
        mes_spend = mes_winners['Cost_CHF'].sum()
        winners_list = mes_winners[['Project_ID', 'Title', 'Cost_CHF', 'Mean_Score', 'Support_Count']].rename(
            columns={'Project_ID': 'project_id', 'Title': 'title', 'Cost_CHF': 'cost', 'Mean_Score': 'score', 'Support_Count': 'supporters'}
        ).to_dict('records')

        all_groups_data.append({
            'group': group, 'budget': budget, 'num_voters': num_voters,
            'mes_spend': mes_spend, 'num_mes': len(mes_winners),
            'num_greedy': len(greedy_winners), 'winners': winners_list,
        })
        print(f"  [{group}] {num_voters} voters, {mes_spend:,} CHF spent, {len(mes_winners)} projects.")

    print("\nCalling GPT-5.1 for overall narrative (may take ~20s)...")
    narrative = get_overall_narrative(all_groups_data)
    if narrative:
        print("  OK: Narrative received.")
    else:
        print("  WARNING: No narrative returned.")

    total_budget = sum(d['budget'] for d in all_groups_data)
    total_spend = sum(d['mes_spend'] for d in all_groups_data)
    total_voters = sum(d['num_voters'] for d in all_groups_data)
    total_projects = sum(d['num_mes'] for d in all_groups_data)
    total_variance = total_budget - total_spend

    report = f"""# Overall Summary: KK26 Participatory Budget

| | |
| :--- | :--- |
| **Total Participants** | {total_voters} voters |
| **Total Budget** | {total_budget:,} CHF |
| **Total MES Allocation** | {total_spend:,} CHF |
| **Total Unspent** | {total_variance:,} CHF |
| **Total Projects Funded (MES)** | {total_projects} |

---

## \U0001f4ca Per-Group Results

| Group | Voters | Budget | MES Spend | Unspent | MES Projects | Popularity Projects |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
"""
    for d in all_groups_data:
        v = d['budget'] - d['mes_spend']
        report += (f"| **{d['group']}** | {d['num_voters']} | {d['budget']:,} CHF | "
                   f"{d['mes_spend']:,} CHF | {v:,} CHF | {d['num_mes']} | {d['num_greedy']} |\n")

    report += "\n---\n\n"

    for d in all_groups_data:
        report += f"### \u2705 Funded Projects \u2014 Group {d['group']}\n\n"
        report += "| # | ID | Project | Cost | Score | Supporters |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n"
        for i, p in enumerate(d['winners'], start=1):
            report += f"| {i} | {int(p['project_id']):03d} | {p['title']} | {p['cost']:,} CHF | {p['score']:.2f} | {int(p['supporters'])} |\n"
        report += "\n"

    report += f"""---

## \U0001f310 What Happened Overall

{narrative.get('overall_de', '')}

*{narrative.get('overall_en', '')}*

---

## \u2696\ufe0f How Fairness Shaped the Results

{narrative.get('fairness_de', '')}

*{narrative.get('fairness_en', '')}*

---

## \U0001f4a1 Key Takeaway

{narrative.get('takeaway_de', '')}

*{narrative.get('takeaway_en', '')}*

---

## \U0001f4c4 Detailed Reports

- [Group ROT](Summary_ROT.md)
- [Group SCHWARZ](Summary_SCHWARZ.md)
- [Group BLAU](Summary_BLAU.md)
"""

    out_path = f"{output_dir}Summary_OVERALL.md"
    with open(out_path, "w") as f:
        f.write(report)
    print(f"  OK: Saved to {out_path}")
    print("\n" + "=" * 50)
    print("DONE: Overall summary generated.")
    print("=" * 50)


if __name__ == "__main__":
    generate_reports()
    generate_overall_summary()
