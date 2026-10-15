interface Env {
  LLCTIMETRACKERV2_APPS_SCRIPT_URL?: string;
  APPS_SCRIPT_URL?: string;
  LLCTRACKERV2_SHARED_SECRET?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const { usernameOrCode, password } = body as any;

    if (!usernameOrCode || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Username/Code and password are required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const scriptUrl = context.env.LLCTIMETRACKERV2_APPS_SCRIPT_URL || context.env.APPS_SCRIPT_URL;
    const secret = context.env.LLCTRACKERV2_SHARED_SECRET;

    if (!scriptUrl || !secret) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing Cloudflare environment bindings for Apps Script URL or shared secret.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const payload = {
      secret,
      action: 'AUTH_LOGIN',
      usernameOrCode,
      password,
    };

    const upstreamRes = await fetch(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const respText = await upstreamRes.text();
    let data: any = {};
    try {
      data = JSON.parse(respText);
    } catch {
      data = { status: 'ERROR', message: respText };
    }

    if (data.status === 'SUCCESS' || data.valid === true) {
      return new Response(
        JSON.stringify({
          success: true,
          valid: true,
          mustChangePassword: !!data.mustChangePassword,
          user: data.user,
          token: data.token || 'v2-token-' + Date.now(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: data.message || data.error || 'Login rejected: Invalid credentials.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: `Authentication proxy error: ${err?.message || err}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
