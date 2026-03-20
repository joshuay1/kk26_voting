import json
import pandas as pd
import os
import re

def extract_rationales():
    js_path = "kk26_voting/receipts/js/data.js"
    csv_dir = "kk26_voting/csv/"
    
    if not os.path.exists(js_path):
        print(f"Error: {js_path} not found.")
        return

    # Read data.js and extract the window.KK26_OUTCOMES object
    # It's a bit tricky because it's not pure JSON
    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the start of window.KK26_OUTCOMES
    match = re.search(r"window\.KK26_OUTCOMES\s*=\s*(\{.*?\});", content, re.DOTALL)
    if not match:
        # Try without the semicolon
        match = re.search(r"window\.KK26_OUTCOMES\s*=\s*(\{.*?\})\s*$", content, re.DOTALL)
        if not match:
            print("Error: Could not find window.KK26_OUTCOMES in data.js")
            return

    outcomes_json_str = match.group(1)
    try:
        outcomes_data = json.loads(outcomes_json_str)
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        # Let's try to fix common trailing comma issues if any
        outcomes_json_str = re.sub(r",\s*([\]}])", r"\1", outcomes_json_str)
        try:
             outcomes_data = json.loads(outcomes_json_str)
        except:
             print("Final JSON decode attempt failed.")
             return

    # Now for each group, write a CSV
    for group, projects in outcomes_data.items():
        csv_path = os.path.join(csv_dir, f"KK26_Outcome_{group}.csv")
        df = pd.DataFrame(projects)
        df.to_csv(csv_path, index=False)
        print(f"Restored {csv_path} with {len(df)} projects.")

if __name__ == "__main__":
    extract_rationales()
