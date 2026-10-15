interface Env {
  LLCTIMETRACKERV2_APPS_SCRIPT_URL?: string;
  APPS_SCRIPT_URL?: string;
  LLCTRACKERV2_SHARED_SECRET?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const { payload } = body as any;

    const scriptUrl = context.env.LLCTIMETRACKERV2_APPS_SCRIPT_URL || context.env.APPS_SCRIPT_URL;
    const secret = context.env.LLCTRACKERV2_SHARED_SECRET;
    if (!scriptUrl || !secret) {
      return new Response(JSON.stringify({ success: false, error: 'Missing environment configuration' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const scriptPayload = {
      secret,
      ...(payload && typeof payload === 'object' ? payload : body),
    };

    const upstreamRes = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scriptPayload),
    });

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text().catch(() => '');
      return new Response(
        JSON.stringify({ success: false, error: `Apps Script upstream returned HTTP ${upstreamRes.status}: ${errText.slice(0, 300)}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const respText = await upstreamRes.text();
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
        JSON.stringify({ success: false, error: data.message || data.error || 'Apps Script sync returned error.', result: data }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        result: data,
        message: data.message || 'Synced successfully.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || err }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
