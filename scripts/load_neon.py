"""
One-shot loader: copies vendor/brahma/data/credit_card_customers.csv into
the `customers` table on the Neon DB referenced by server/.env's
NEON_TEST_URL. Idempotent — drops + recreates the table on each run.

Usage: python scripts/load_neon.py
"""
import os
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent.parent
CSV = ROOT / "vendor" / "brahma" / "data" / "credit_card_customers.csv"
TABLE = "customers"


def main() -> None:
    load_dotenv(ROOT / "server" / ".env", override=True)
    url = os.environ.get("NEON_TEST_URL")
    if not url:
        raise SystemExit("NEON_TEST_URL not set in server/.env")
    p = urlparse(url)

    df = pd.read_csv(CSV)
    print(f"loaded {len(df)} rows × {len(df.columns)} cols from {CSV.name}")

    # Build CREATE TABLE from dtypes
    pg_types = {"int64": "BIGINT", "float64": "DOUBLE PRECISION", "object": "TEXT", "bool": "BOOLEAN"}
    cols_sql = ",\n  ".join(
        f'"{c}" {pg_types.get(str(df[c].dtype), "TEXT")}' for c in df.columns
    )

    conn = psycopg2.connect(
        host=p.hostname,
        port=p.port or 5432,
        dbname=p.path.lstrip("/").split("?")[0],
        user=p.username,
        password=p.password,
        sslmode="require",
    )
    conn.autocommit = False
    try:
        cur = conn.cursor()
        cur.execute(f'DROP TABLE IF EXISTS {TABLE}')
        cur.execute(f'CREATE TABLE {TABLE} (\n  {cols_sql}\n)')
        # Bulk insert
        rows = [tuple(None if pd.isna(v) else v for v in r) for r in df.itertuples(index=False, name=None)]
        cols_list = ", ".join(f'"{c}"' for c in df.columns)
        execute_values(
            cur,
            f'INSERT INTO {TABLE} ({cols_list}) VALUES %s',
            rows,
            page_size=500,
        )
        conn.commit()
        cur.execute(f'SELECT count(*) FROM {TABLE}')
        n = cur.fetchone()[0]
        print(f"inserted {n} rows into {TABLE}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
