import pandas as pd
import glob
import os
import sys
import json
from dotenv import load_dotenv

# Ensure we can import mes.py from previous_old_scripts
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "previous_old_scripts"))
from mes import equal_shares_with_receipt

def find_mes_rho(voters, project, cost, voter_utilities, voter_budgets):
    supporters = [v for v in voters if voter_utilities[v][project] > 0]
    total_util = sum(voter_utilities[v][project] for v in supporters)
    if total_util == 0 or sum(voter_budgets[v] for v in supporters) < cost:
        return None
    sorted_v = sorted(supporters, key=lambda v: voter_budgets[v] / voter_utilities[v][project])
    current_sum = 0
    rem_util = total_util
    for v in sorted_v:
        rho = voter_budgets[v] / voter_utilities[v][project]
        needed = cost - current_sum
        pot_rho = needed / rem_util
        if pot_rho <= rho:
            return pot_rho
        current_sum += voter_budgets[v]
        rem_util -= voter_utilities[v][project]
    return None

def run_full_comparison():
    input_files = glob.glob("data/cleaned/KK26_poll_cleaned_*.csv")
    budget_excel_path = "raw_data/KK26_Projekte_Auswahl_BUDGET_JY.xlsx"
    group_budgets = {'BLAU': 63000, 'SCHWARZ': 49000, 'ROT': 49000}
    
    budget_df = pd.read_excel(budget_excel_path)
    budget_df['proj_id'] = budget_df['Antrags-ID'].astype(str).str.replace('KK_26_', '').str.strip()
    cost_dict = dict(zip(budget_df['proj_id'], budget_df['Geld – Wie viel Geld beantragst du vom Kultur Komitee für das Projekt? (CHF)']))
    project_titles = dict(zip(budget_df['proj_id'], budget_df['Titel']))
    
    full_md = "# Full Method Comparison: Efficiency vs. Popularity vs. Greedy\n\n"
    full_md += "This report compares three prioritization methods across all groups:\n"
    full_md += "1. **MES (Efficiency)**: Standard academic approach (Bang for your buck). This uses individual voter budgets.\n"
    full_md += "2. **MES (Popularity)**: Weighted vote count order, but still respects individual budgets.\n"
    full_md += "3. **Greedy**: Raw vote count, ignores individual budgets.\n\n"
    
    disagreements = []
    
    for input_file in sorted(input_files):
        basename = os.path.basename(input_file)
        group_name = basename.split('_')[-1].replace('.csv', '')
        total_budget = group_budgets.get(group_name, 50000)
        
        print(f"Processing {group_name}...")
        
        df = pd.read_csv(input_file, sep=';')
        voters = df['Voter_ID'].tolist()
        projects = [col for col in df.columns if col != 'Voter_ID']
        cost = {p: cost_dict.get(p, 10000) for p in projects}
        utility_map = {'Ja': 2, 'EherJa': 1, 'EherNein': 0, 'Nein': 0}
        
        # --- Common Data ---
        u_raw = {voder: {p: utility_map.get(str(df[df['Voter_ID']==voder][p].values[0]).strip(), 0) for p in projects} for voder in voters}
        total_votes = {p: sum(u_raw[v][p] for v in voters) for p in projects}
        
        # --- METHOD 1: MES (EFFICIENCY) ---
        winners_std, _, _, _, _, _, _ = equal_shares_with_receipt(voters, projects, cost, u_raw, total_budget, total_votes)
        cost_std = sum(cost[p] for p in winners_std)
        util_std = sum(total_votes[p] for p in winners_std)
        eff_std = util_std / (cost_std / 10000) if cost_std > 0 else 0
        
        # --- METHOD 2: MES (POPULARITY) ---
        # Sort by total utility first
        pop_order = sorted(projects, key=lambda p: (total_votes[p], p), reverse=True)
        winners_pop = []
        v_budgets = {v: total_budget / len(voters) for v in voters}
        
        next_pop_candidate = None
        for p in pop_order:
            rho = find_mes_rho(voters, p, cost[p], u_raw, v_budgets)
            if rho is not None:
                winners_pop.append(p)
                for v in voters:
                    v_budgets[v] -= min(v_budgets[v], rho * u_raw[v][p])
            else:
                next_pop_candidate = p
                break
        
        # Completion logic for MES Pop
        c_cost_pop = sum(cost[p] for p in winners_pop)
        if next_pop_candidate is not None:
            new_cost = c_cost_pop + cost[next_pop_candidate]
            if abs(new_cost - total_budget) < abs(c_cost_pop - total_budget):
                winners_pop.append(next_pop_candidate)
                
        cost_pop = sum(cost[p] for p in winners_pop)
        util_pop = sum(total_votes[p] for p in winners_pop)
        eff_pop = util_pop / (cost_pop / 10000) if cost_pop > 0 else 0
        
        # --- METHOD 3: GREEDY ---
        winners_greedy = []
        g_cost = 0
        next_greedy_candidate = None
        for p in pop_order:
            if g_cost + cost[p] <= total_budget:
                winners_greedy.append(p)
                g_cost += cost[p]
            else:
                next_greedy_candidate = p
                break
                
        if next_greedy_candidate is not None:
            new_greedy_cost = g_cost + cost[next_greedy_candidate]
            if abs(new_greedy_cost - total_budget) < abs(g_cost - total_budget):
                winners_greedy.append(next_greedy_candidate)
                g_cost += cost[next_greedy_candidate]
        cost_greedy = g_cost
        util_greedy = sum(total_votes[p] for p in winners_greedy)
        eff_greedy = util_greedy / (cost_greedy / 10000) if cost_greedy > 0 else 0
        
        full_md += f"## Group: {group_name}\n"
        full_md += f"**Budget Target: CHF {total_budget}**\n\n"
        
        full_md += "| Metric | MES (Efficiency) | MES (Popularity) | Greedy (Pure Pop) |\n"
        full_md += "| --- | --- | --- | --- |\n"
        full_md += f"| **Num Winners** | {len(winners_std)} | {len(winners_pop)} | {len(winners_greedy)} |\n"
        full_md += f"| **Total Spent** | CHF {cost_std} | CHF {cost_pop} | CHF {cost_greedy} |\n"
        full_md += f"| **Total Utility Points** | {util_std} | {util_pop} | {util_greedy} |\n"
        full_md += f"| **Efficiency (Util/10k CHF)** | {eff_std:.2f} | {eff_pop:.2f} | {eff_greedy:.2f} |\n"
        full_md += f"| **Avg. Cost / Utility Pt** | CHF {int(cost_std/util_std) if util_std else 0} | CHF {int(cost_pop/util_pop) if util_pop else 0} | CHF {int(cost_greedy/util_greedy) if util_greedy else 0} |\n"
        full_md += f"| **Avg. Cost / Project** | CHF {int(cost_std/len(winners_std)) if winners_std else 0} | CHF {int(cost_pop/len(winners_pop)) if winners_pop else 0} | CHF {int(cost_greedy/len(winners_greedy)) if winners_greedy else 0} |\n\n"
        
        full_md += "| Project | Cost | Util | Std | Pop | Greedy | Status |\n"
        full_md += "| --- | --- | --- | --- | --- | --- | --- |\n"
        
        for p in projects:
            is_std = p in winners_std
            is_pop = p in winners_pop
            is_greedy = p in winners_greedy
            p_title = project_titles.get(p, p)
            p_cost = cost[p]
            p_utility = total_votes[p]
            
            if len(set([is_std, is_pop, is_greedy])) > 1:
                status = "**DISAGREEMENT**"
                disagreements.append({
                    'Group': group_name, 'Project': p_title, 'Cost': p_cost, 'Utility': p_utility,
                    'Std': is_std, 'Pop': is_pop, 'Greedy': is_greedy
                })
            else:
                status = "Consistent"
            
            full_md += f"| {p_title[:30]} | {p_cost} | {p_utility} | {'Y' if is_std else '-'} | {'Y' if is_pop else '-'} | {'Y' if is_greedy else '-'} | {status} |\n"
        full_md += "\n"
        
    full_md += "## Summary of Disagreements\n"
    if disagreements:
        full_md += "| Group | Project | Cost | Util | Std | Pop | Greedy |\n"
        full_md += "| --- | --- | --- | --- | --- | --- | --- |\n"
        for d in disagreements:
            full_md += f"| {d['Group']} | {d['Project'][:40]} | {d['Cost']} | {d['Utility']} | {'Y' if d['Std'] else '-'} | {'Y' if d['Pop'] else '-'} | {'Y' if d['Greedy'] else '-'} |\n"
    else:
        full_md += "No major disagreements found.\n"
        
    output_path = "kk26_voting/reports/MES_Method_Comparison_V2.md"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w') as f:
        f.write(full_md)
    print(f"Report saved to {output_path}")

if __name__ == "__main__":
    run_full_comparison()
