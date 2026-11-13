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

    const scriptUrl = (context.env.LLCTIMETRACKERV2_APPS_SCRIPT_URL || context.env.APPS_SCRIPT_URL || '').trim();
    const secret = (context.env.LLCTRACKERV2_SHARED_SECRET || '').trim();

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
        JSON.stringify({ success: false, error: 'Google Apps Script returned an invalid response while saving password.' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
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
    const isAbort = err?.name === 'AbortError';
    return new Response(
      JSON.stringify({
        success: false,
        error: isAbort
          ? 'Password update timed out waiting for Google Sheets. Please try again.'
          : `Password update proxy error: ${err?.message || err}`,
      }),
      { status: isAbort ? 504 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
