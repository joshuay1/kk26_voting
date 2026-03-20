import pandas as pd
import json
import os
from datetime import datetime

def assemble_data_js():
    receipts_dir = "kk26_voting/receipts/"
    csv_dir = "kk26_voting/csv/"
    js_output = os.path.join(receipts_dir, "js/data.js")
    
    # 1. Load data.json (contains window.KK26_PROJECTS)
    data_json_path = os.path.join(receipts_dir, "data.json")
    if not os.path.exists(data_json_path):
        print(f"Error: {data_json_path} not found.")
        return

    with open(data_json_path, 'r', encoding='utf-8') as f:
        data_json = json.load(f)

    # 2. Build window.KK26_OUTCOMES from CSVs
    outcomes = {}
    for group in ["ROT", "SCHWARZ", "BLAU"]:
        outcome_csv = os.path.join(csv_dir, f"KK26_Outcome_{group}.csv")
        if os.path.exists(outcome_csv):
            df = pd.read_csv(outcome_csv)
            # Convert to list of dicts
            outcomes[group] = df.to_dict('records')
        else:
            print(f"Warning: Outcome CSV for {group} not found.")

    # 3. Write to data.js
    with open(js_output, 'w', encoding='utf-8') as f:
        # We start with KK26_PROJECTS
        f.write("\nwindow.KK26_PROJECTS = ")
        json.dump(data_json, f, indent=2, ensure_ascii=False)
        f.write(";\n")
        
        # Then KK26_OUTCOMES
        f.write("window.KK26_OUTCOMES = ")
        json.dump(outcomes, f, indent=2, ensure_ascii=False)
        f.write(";\n")

    print(f"Successfully assembled {js_output}")

if __name__ == "__main__":
    assemble_data_js()
