import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_actions (
      id SERIAL PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT NOT NULL,
      value_actual NUMERIC,
      value_threshold NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS campaign_snapshots (
      id SERIAL PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      campaign_name TEXT,
      status TEXT,
      spend NUMERIC,
      impressions INTEGER,
      clicks INTEGER,
      ctr NUMERIC,
      cpl NUMERIC,
      frequency NUMERIC,
      leads INTEGER,
      daily_budget NUMERIC,
      snapshot_date DATE DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_actions_campaign ON agent_actions(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_date ON campaign_snapshots(snapshot_date);
  `);
}

export async function logAction(
  campaignId: string,
  action: string,
  reason: string,
  valueActual: number,
  valueThreshold: number
): Promise<void> {
  await pool.query(
    `INSERT INTO agent_actions (campaign_id, action, reason, value_actual, value_threshold) VALUES ($1,$2,$3,$4,$5)`,
    [campaignId, action, reason, valueActual, valueThreshold]
  );
}

export async function saveSnapshot(campaigns: import('../meta/insights').CampaignInsight[]): Promise<void> {
  for (const c of campaigns) {
    await pool.query(
      `INSERT INTO campaign_snapshots
        (campaign_id, account_id, campaign_name, status, spend, impressions, clicks, ctr, cpl, frequency, leads, daily_budget)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT DO NOTHING`,
      [c.campaign_id, c.account_id, c.campaign_name, c.status, c.spend, c.impressions, c.clicks, c.ctr, c.cpl, c.frequency, c.leads, c.daily_budget]
    );
  }
}

export async function getRecentActions(limit = 50) {
  const r = await pool.query(
    `SELECT * FROM agent_actions ORDER BY created_at DESC LIMIT $1`,
    [limit]
  );
  return r.rows;
}

export async function getSnapshots(days = 7) {
  const r = await pool.query(
    `SELECT * FROM campaign_snapshots WHERE snapshot_date >= CURRENT_DATE - $1 ORDER BY created_at DESC`,
    [days]
  );
  return r.rows;
}

export default pool;
