/* NOVA v003 — arranca el planificador una vez por proceso */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('@/lib/nova/scheduler');
    startScheduler();
  }
}
