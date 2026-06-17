import json
import os

import pandas as pd


def extract_rationales():
    data_path = "site/assets/data/kk26.json"
    csv_dir = "kk26_voting/csv/"

    if not os.path.exists(data_path):
        print(f"Error: {data_path} not found.")
        return

    with open(data_path, "r", encoding="utf-8") as f:
        site_data = json.load(f)

    outcomes_data = site_data.get("outcomes", {})
    if not outcomes_data:
        print(f"Error: Could not find outcomes in {data_path}")
        return

    for group, projects in outcomes_data.items():
        csv_path = os.path.join(csv_dir, f"KK26_Outcome_{group}.csv")
        df = pd.DataFrame(projects)
        df.to_csv(csv_path, index=False)
        print(f"Restored {csv_path} with {len(df)} projects.")


if __name__ == "__main__":
    extract_rationales()
