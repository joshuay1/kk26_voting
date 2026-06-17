import json
import os

import pandas as pd


SITE_DATA_PATH = "site/assets/data/kk26.json"
SITE_DATA_JS_PATH = "site/assets/data/kk26-data.js"
CSV_DIR = "kk26_voting/csv/"
GROUPS = ["ROT", "SCHWARZ", "BLAU"]


def assemble_site_data():
    if not os.path.exists(SITE_DATA_PATH):
        print(f"Error: {SITE_DATA_PATH} not found.")
        return

    with open(SITE_DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    outcomes = {}
    for group in GROUPS:
        outcome_csv = os.path.join(CSV_DIR, f"KK26_Outcome_{group}.csv")
        if os.path.exists(outcome_csv):
            df = pd.read_csv(outcome_csv)
            df = df.astype(object).where(pd.notna(df), None)
            outcomes[group] = df.to_dict("records")
        else:
            print(f"Warning: Outcome CSV for {group} not found.")

    data["outcomes"] = outcomes

    os.makedirs(os.path.dirname(SITE_DATA_PATH), exist_ok=True)
    with open(SITE_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, allow_nan=False)
        f.write("\n")

    with open(SITE_DATA_JS_PATH, "w", encoding="utf-8") as f:
        f.write("window.KK26_PUBLIC_DATA = ")
        json.dump(data, f, ensure_ascii=False, allow_nan=False)
        f.write(";\n")

    print(f"Successfully assembled {SITE_DATA_PATH} and {SITE_DATA_JS_PATH}")


if __name__ == "__main__":
    assemble_site_data()
