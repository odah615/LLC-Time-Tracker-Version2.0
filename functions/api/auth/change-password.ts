interface Env {
  LLCTIMETRACKERV2_APPS_SCRIPT_URL?: string;
  APPS_SCRIPT_URL?: string;
  LLCTRACKERV2_SHARED_SECRET?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const { userId, employeeCode, username, newPassword } = body as any;

    if (!newPassword || (!userId && !employeeCode && !username)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Valid userId/employeeCode and newPassword are required.' }),
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
      action: 'UPDATE_PASSWORD',
      userId,
      employeeCode,
      username,
      newPassword,
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

    if (data.status === 'SUCCESS' || data.verified === true) {
      return new Response(
        JSON.stringify({
          success: true,
          message: data.message || 'Password successfully updated.',
          user: data.user,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: data.message || data.error || 'Password update failed.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: `Password update proxy error: ${err?.message || err}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
