import pandas as pd
import json
import os

# Configuration
GROUPS = ["ROT", "SCHWARZ", "BLAU"]
BUDGET_PER_VOTER = 7000.0

def simulate_mes(group):
    receipts_file = f"kk26_voting/csv/KK26_Receipts_{group}.csv"
    outcome_file = f"kk26_voting/csv/KK26_Outcome_{group}.csv"
    
    if not os.path.exists(receipts_file) or not os.path.exists(outcome_file):
        print(f"Files for {group} not found. Skipping.")
        return None

    df_receipts = pd.read_csv(receipts_file)
    df_outcome = pd.read_csv(outcome_file)

    # 1. Get all projects and their costs
    projects = {}
    for _, row in df_outcome.iterrows():
        p_id = int(row['Project_ID'])
        projects[p_id] = {
            "id": p_id,
            "title": row['Title'],
            "cost": float(row['Cost_CHF']),
            "utility": float(row['Total_Utility']),
            "proponents": {} # voter_id -> utility
        }

    # 2. Get all voters and their utilities
    voters = df_receipts['Voter_ID'].unique()
    voter_budgets = {v: BUDGET_PER_VOTER for v in voters}
    
    for _, row in df_receipts.iterrows():
        p_id = int(row['Project_ID'])
        v_id = row['Voter_ID']
        vote = row['Vote']
        
        util = 0
        if vote == 'Ja': util = 2
        elif vote == 'EherJa': util = 1
        
        if util > 0 and p_id in projects:
            projects[p_id]["proponents"][v_id] = util

    # 3. MES Simulation (Simplified Equal Shares)
    funded = []
    remaining_projects = list(projects.keys())
    
    project_rejection_states = {} # p_id -> state

    while True:
        best_p = None
        min_rho = float('inf')
        
        for p_id in remaining_projects:
            p = projects[p_id]
            # Find rho such that sum min(budget, utility/rho) = cost
            # sum[v in proponents] min(v_budget, v_utility / rho) = p_cost
            
            # Binary search for rho
            low = 0.00001
            high = 1000000.0
            p_rho = None
            
            for _ in range(50):
                mid = (low + high) / 2
                current_sum = sum(min(voter_budgets[v], u / mid) for v, u in p["proponents"].items())
                if current_sum > p["cost"]:
                    low = mid
                else:
                    high = mid
            
            p_rho = high
            # Check if affordable
            total_available = sum(voter_budgets[v] for v in p["proponents"].keys())
            
            # Store state at consideration (this round)
            if p_id not in project_rejection_states:
                project_rejection_states[p_id] = {
                    "supporter_budget": total_available,
                    "group_budget": sum(voter_budgets.values())
                }

            if total_available >= p["cost"]:
                if p_rho < min_rho:
                    min_rho = p_rho
                    best_p = p_id

        if best_p is None:
            break
            
        # Fund best_p
        p = projects[best_p]
        for v, u in p["proponents"].items():
            payment = min(voter_budgets[v], u / min_rho)
            voter_budgets[v] -= payment
            
        funded.append(best_p)
        remaining_projects.remove(best_p)

    return {
        "funded": funded,
        "rejection_states": project_rejection_states,
        "final_budgets": voter_budgets
    }

if __name__ == "__main__":
    results = {}
    for group in GROUPS:
        print(f"Simulating {group}...")
        results[group] = simulate_mes(group)
        if results[group]:
            print(f"  Funded {len(results[group]['funded'])} projects.")
    
    with open("tmp_mes_simulation.json", "w") as f:
        json.dump(results, f, indent=2)
