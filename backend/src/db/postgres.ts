import { Pool, PoolClient } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedGestores(client: PoolClient) {
  const { rowCount } = await client.query('SELECT 1 FROM gestores LIMIT 1');
  if (rowCount && rowCount > 0) return; // already seeded

  const gestores = [
    { name: 'ADRIANO', color: 'blue', is_director: false, accounts: [{ id: 'act_1095859619406442', project: 'JOTAP' }] },
    { name: 'HUEVERTON', color: 'purple', is_director: false, accounts: [{ id: 'act_1628949641648813', project: 'JOTAP' }, { id: 'act_1520081442881968', project: 'JOTAP' }] },
    { name: 'IVAN', color: 'green', is_director: true, accounts: [] },
    { name: 'DIOGO', color: 'orange', is_director: false, accounts: [{ id: 'act_1430948701654012', project: 'JOTAP' }] },
    { name: 'GABRIEL', color: 'pink', is_director: false, accounts: [{ id: 'act_1322469786598233', project: 'JOTAP' }] },
  ];

  for (const g of gestores) {
    const { rows } = await client.query(
      `INSERT INTO gestores (name, color, is_director) VALUES ($1, $2, $3) RETURNING id`,
      [g.name, g.color, g.is_director]
    );
    const gestorId = rows[0].id;
    for (const acc of g.accounts) {
      await client.query(
        `INSERT INTO gestor_accounts (gestor_id, account_id, project_name) VALUES ($1, $2, $3)`,
        [gestorId, acc.id, acc.project]
      );
    }
  }
}

export async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_actions (
      id SERIAL PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      action TEXT NOT NULL,
      reason TEXT NOT NULL,
      value_actual NUMERIC,
      value_threshold NUMERIC,
      source TEXT NOT NULL DEFAULT 'AGENT',
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

    CREATE TABLE IF NOT EXISTS agent_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_actions_campaign ON agent_actions(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_snapshots_date ON campaign_snapshots(snapshot_date);
  `);
  await pool.query(`
    ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'AGENT';
  `);
  await pool.query(`
    UPDATE agent_actions SET source = 'AGENT' WHERE source IS NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gestores (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      is_director BOOLEAN DEFAULT FALSE,
      color TEXT DEFAULT 'blue',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gestor_accounts (
      gestor_id UUID REFERENCES gestores(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL,
      project_name TEXT NOT NULL DEFAULT 'JOTAP',
      PRIMARY KEY (gestor_id, account_id)
    );
  `);
  await pool.query(`
    ALTER TABLE gestores ADD COLUMN IF NOT EXISTS agent_enabled BOOLEAN DEFAULT false;
  `);
  // Assign RAMON accounts to IVAN and ADRIANO (BB 01 não incluso — pertence ao ZECA)
  await pool.query(`
    INSERT INTO gestor_accounts (gestor_id, account_id, project_name)
    SELECT g.id, a.account_id, 'RAMON'
    FROM gestores g
    CROSS JOIN (VALUES
      ('act_1677889643448352'),
      ('act_1068494141940786'),
      ('act_1259981386320730'),
      ('act_1915057486047147')
    ) AS a(account_id)
    WHERE g.name IN ('IVAN', 'ADRIANO')
    ON CONFLICT DO NOTHING;
  `);
  // Assign ZECA accounts to DIOGO and HUEVERTON (inclui BB 01)
  await pool.query(`
    INSERT INTO gestor_accounts (gestor_id, account_id, project_name)
    SELECT g.id, a.account_id, 'ZECA'
    FROM gestores g
    CROSS JOIN (VALUES
      ('act_809590885250558'),
      ('act_932647832992759'),
      ('act_1430896401540194')
    ) AS a(account_id)
    WHERE g.name IN ('DIOGO', 'HUEVERTON')
    ON CONFLICT DO NOTHING;
  `);
  // Corretiva: remove BB 01 de IVAN e ADRIANO se existir
  await pool.query(`
    DELETE FROM gestor_accounts
    WHERE account_id = 'act_809590885250558'
      AND gestor_id IN (SELECT id FROM gestores WHERE name IN ('IVAN', 'ADRIANO'));
  `);
  const client = await pool.connect();
  try {
    await seedGestores(client);
  } finally {
    client.release();
  }
}

export async function logAction(
  campaignId: string,
  action: string,
  reason: string,
  valueActual: number,
  valueThreshold: number,
  source: 'AGENT' | 'MANUAL' = 'AGENT'
): Promise<void> {
  await pool.query(
    `INSERT INTO agent_actions (campaign_id, action, reason, value_actual, value_threshold, source) VALUES ($1,$2,$3,$4,$5,$6)`,
    [campaignId, action, reason, valueActual, valueThreshold, source]
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

export async function getCampaignsPausedToday(): Promise<string[]> {
  const r = await pool.query(`
    SELECT DISTINCT campaign_id FROM agent_actions
    WHERE action IN ('PAUSE_CAMPAIGN', 'MANUAL_PAUSE')
      AND created_at AT TIME ZONE 'America/Sao_Paulo' >= CURRENT_DATE
      AND campaign_id NOT IN (
        SELECT campaign_id FROM agent_actions
        WHERE action IN ('ACTIVATE_CAMPAIGN', 'MANUAL_ACTIVATE')
          AND created_at AT TIME ZONE 'America/Sao_Paulo' >= CURRENT_DATE
      )
  `);
  return r.rows.map((row: { campaign_id: string }) => row.campaign_id);
}

export async function getAdsetsPausedToday(): Promise<{ id: string; cpl_quando_pausado: number }[]> {
  const r = await pool.query(`
    SELECT DISTINCT ON (campaign_id) campaign_id, value_actual
    FROM agent_actions
    WHERE action = 'PAUSE_ADSET'
      AND created_at AT TIME ZONE 'America/Sao_Paulo' >= CURRENT_DATE
      AND campaign_id NOT IN (
        SELECT campaign_id FROM agent_actions
        WHERE action = 'ACTIVATE_ADSET'
          AND created_at AT TIME ZONE 'America/Sao_Paulo' >= CURRENT_DATE
      )
    ORDER BY campaign_id, created_at DESC
  `);
  return r.rows.map((row: { campaign_id: string; value_actual: number }) => ({
    id: row.campaign_id,
    cpl_quando_pausado: row.value_actual ?? 0,
  }));
}

export async function getAdsPausedToday(): Promise<{ id: string; cpl_quando_pausado: number }[]> {
  const r = await pool.query(`
    SELECT DISTINCT ON (campaign_id) campaign_id, value_actual
    FROM agent_actions
    WHERE action = 'PAUSE_AD'
      AND created_at AT TIME ZONE 'America/Sao_Paulo' >= CURRENT_DATE
      AND campaign_id NOT IN (
        SELECT campaign_id FROM agent_actions
        WHERE action = 'ACTIVATE_AD'
          AND created_at AT TIME ZONE 'America/Sao_Paulo' >= CURRENT_DATE
      )
    ORDER BY campaign_id, created_at DESC
  `);
  return r.rows.map((row: { campaign_id: string; value_actual: number }) => ({
    id: row.campaign_id,
    cpl_quando_pausado: row.value_actual ?? 0,
  }));
}

export async function getSetting(key: string): Promise<string | null> {
  const r = await pool.query(`SELECT value FROM agent_settings WHERE key = $1`, [key]);
  return r.rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO agent_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value]
  );
}

export async function getSnapshots(days = 7) {
  const r = await pool.query(
    `SELECT * FROM campaign_snapshots WHERE snapshot_date >= CURRENT_DATE - $1 ORDER BY created_at DESC`,
    [days]
  );
  return r.rows;
}

export async function getGestores() {
  const { rows } = await pool.query(`
    SELECT g.id, g.name, g.color, g.is_director, g.agent_enabled,
      COALESCE(
        json_agg(json_build_object('account_id', ga.account_id, 'project_name', ga.project_name))
        FILTER (WHERE ga.account_id IS NOT NULL), '[]'
      ) as accounts
    FROM gestores g
    LEFT JOIN gestor_accounts ga ON ga.gestor_id = g.id
    GROUP BY g.id, g.name, g.color, g.is_director, g.agent_enabled
    ORDER BY g.name
  `);
  return rows;
}

export async function toggleGestorAgent(gestorId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `UPDATE gestores SET agent_enabled = NOT agent_enabled WHERE id = $1 RETURNING agent_enabled`,
    [gestorId]
  );
  return rows[0]?.agent_enabled ?? false;
}

export async function getGestorEnabledAccounts(): Promise<string[]> {
  const { rows } = await pool.query(`
    SELECT ga.account_id
    FROM gestor_accounts ga
    JOIN gestores g ON g.id = ga.gestor_id
    WHERE g.agent_enabled = true
  `);
  return rows.map((r: { account_id: string }) => r.account_id);
}

export async function addGestorAccount(gestorId: string, accountId: string, projectName: string) {
  await pool.query(
    `INSERT INTO gestor_accounts (gestor_id, account_id, project_name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [gestorId, accountId, projectName]
  );
}

export async function removeGestorAccount(gestorId: string, accountId: string) {
  await pool.query(
    `DELETE FROM gestor_accounts WHERE gestor_id = $1 AND account_id = $2`,
    [gestorId, accountId]
  );
}

export default pool;
