import { NextResponse } from 'next/server';
import { prewarmCscForm6Assets } from '@/lib/csc-leave-form';
import { prewarmUseLeaveAssets } from '@/lib/use-leave-form';
import { runSystemMaintenance } from '@/lib/system-maintenance';

export const dynamic = 'force-dynamic';
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';

export async function GET() {
  const startedAt = Date.now();
  try {
    if (IS_DEVELOPMENT) {
      console.info('[PDF] warmup endpoint called');
    }
    
    // Run automated standalone background checks asynchronously
    runSystemMaintenance().catch((err) => console.error('[Maintenance Error]', err));

    const [cscResult, useResult] = await Promise.all([
      prewarmCscForm6Assets(),
      prewarmUseLeaveAssets(),
    ]);
    const elapsedMs = Date.now() - startedAt;
    if (IS_DEVELOPMENT) {
      console.info(`[PDF] warmup endpoint completed in ${elapsedMs}ms`, {
        cscForm6: cscResult,
        useLeave: useResult,
      });
    }

    return NextResponse.json({
      ok: true,
      target: 'pdf-templates',
      elapsedMs,
      warmedAt: {
        cscForm6: cscResult.warmedAt,
        useLeave: useResult.warmedAt,
      },
    });
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    console.error('Failed to warm PDF assets in ' + elapsedMs + 'ms:', error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Unable to warm PDF assets.',
        elapsedMs,
      },
      { status: 500 }
    );
  }
}
