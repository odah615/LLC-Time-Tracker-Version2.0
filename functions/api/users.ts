interface Env {
  LLCTIMETRACKERV2_APPS_SCRIPT_URL?: string;
  APPS_SCRIPT_URL?: string;
  LLCTRACKERV2_SHARED_SECRET?: string;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    const scriptUrl = (context.env.LLCTIMETRACKERV2_APPS_SCRIPT_URL || context.env.APPS_SCRIPT_URL || '').trim();
    const secret = (context.env.LLCTRACKERV2_SHARED_SECRET || '').trim();
    if (!scriptUrl || !secret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing LLCTIMETRACKERV2_APPS_SCRIPT_URL or LLCTRACKERV2_SHARED_SECRET in Cloudflare Pages environment.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const payload = { secret, action: 'GET_EMPLOYEES' };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    let upstreamRes: Response;
    let respText = '';
    try {
      upstreamRes = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      respText = await upstreamRes.text();
    } finally {
      clearTimeout(timeoutId);
    }

    if (!upstreamRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Apps Script upstream returned HTTP ${upstreamRes.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let data: any = null;
    try {
      data = JSON.parse(respText);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Apps Script returned non-JSON response while loading employees.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!data || data.status === 'ERROR' || data.error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: data?.message || data?.error || 'Apps Script failed to load employees.',
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const url = new URL(context.request.url);
    const reqSupervisor = url.searchParams.get('supervisor') || url.searchParams.get('teamLeaderId');

    let employees = Array.isArray(data.employees) ? data.employees : [];
    if (reqSupervisor) {
      const supLower = reqSupervisor.toLowerCase().trim();
      employees = employees.filter((e: any) => {
        const tl = String(e.teamLeaderId || e.supervisor || '').toLowerCase().trim();
        const code = String(e.employeeCode || '').toLowerCase().trim();
        const username = String(e.username || '').toLowerCase().trim();
        return tl === supLower || tl.includes(supLower) || code === supLower || username === supLower;
      });
    }

    return new Response(JSON.stringify(employees), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return new Response(
      JSON.stringify({
        success: false,
        error: isAbort ? 'Timed out loading employee directory from Google Sheets.' : (err?.message || String(err)),
      }),
      { status: isAbort ? 504 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const scriptUrl = (context.env.LLCTIMETRACKERV2_APPS_SCRIPT_URL || context.env.APPS_SCRIPT_URL || '').trim();
    const secret = (context.env.LLCTRACKERV2_SHARED_SECRET || '').trim();
    if (!scriptUrl || !secret) {
      return new Response(JSON.stringify({ success: false, error: 'Missing environment configuration' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload = {
      secret,
      action: 'SYNC_EMPLOYEES',
      users: Array.isArray(body) ? body : body.users || [body],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    let upstreamRes: Response;
    let respText = '';
    try {
      upstreamRes = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      respText = await upstreamRes.text();
    } finally {
      clearTimeout(timeoutId);
    }

    let data: any = {};
    try {
      data = JSON.parse(respText);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Apps Script returned non-JSON response while saving employees.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (data.status === 'ERROR' || data.error) {
      return new Response(
        JSON.stringify({ success: false, error: data.message || data.error || 'Failed to sync employees.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ success: true, result: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return new Response(
      JSON.stringify({ success: false, error: isAbort ? 'Timed out saving employees.' : (err?.message || String(err)) }),
      { status: isAbort ? 504 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
