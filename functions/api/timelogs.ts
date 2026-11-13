interface Env {
  LLCTIMETRACKERV2_APPS_SCRIPT_URL?: string;
  APPS_SCRIPT_URL?: string;
  LLCTRACKERV2_SHARED_SECRET?: string;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId') || undefined;
    const days = url.searchParams.get('days') || undefined;
    const since = url.searchParams.get('since') || undefined;

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

    const payload = {
      secret,
      action: 'GET_TIMELOGS',
      userId,
      days: days ? Number(days) : undefined,
      since,
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
        JSON.stringify({ success: false, error: 'Apps Script returned non-JSON response while loading time logs.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!data || data.status === 'ERROR' || data.error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: data?.message || data?.error || 'Apps Script failed to load time logs.',
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        timeLogs: Array.isArray(data.timeLogs) ? data.timeLogs : [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return new Response(
      JSON.stringify({
        success: false,
        error: isAbort ? 'Timed out loading time logs from Google Sheets.' : (err?.message || String(err)),
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
      return new Response(
        JSON.stringify({ success: false, error: 'Missing LLCTIMETRACKERV2_APPS_SCRIPT_URL or LLCTRACKERV2_SHARED_SECRET in Cloudflare Pages environment.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const payload = {
      secret,
      action: 'SYNC_TIMELOGS',
      timeLogs: Array.isArray(body) ? body : body.timeLogs || [body],
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

    if (!upstreamRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Apps Script upstream returned HTTP ${upstreamRes.status}: ${respText.slice(0, 300)}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let data: any = {};
    try {
      data = JSON.parse(respText);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Apps Script returned non-JSON response.', raw: respText.slice(0, 300) }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (data.status === 'ERROR' || data.error) {
      return new Response(
        JSON.stringify({ success: false, error: data.message || data.error || 'Apps Script returned failure.', result: data }),
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
      JSON.stringify({ success: false, error: isAbort ? 'Timed out syncing time logs.' : (err?.message || String(err)) }),
      { status: isAbort ? 504 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
