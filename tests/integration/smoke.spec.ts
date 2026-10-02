import { describeWithStack, pool } from './support/stack.ts';

describeWithStack('local postgres stack', () => {
  it('is reachable', async () => {
    const result = await pool.query<{ ok: number }>('select 1 as ok');

    expect(result.rows[0]?.ok).toBe(1);
  });
});