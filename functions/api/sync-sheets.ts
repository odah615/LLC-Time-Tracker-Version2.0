interface Env {
  LLCTIMETRACKERV2_APPS_SCRIPT_URL?: string;
  APPS_SCRIPT_URL?: string;
  LLCTRACKERV2_SHARED_SECRET?: string;
}

const isHtmlResponse = (str: string): boolean => {
  if (!str) return false;
  const trimmed = str.trim().toLowerCase();
  return (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.includes('<body') ||
    trimmed.includes('google accounts') ||
    trimmed.includes('accounts.google.com')
  );
};

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

    let lastError = '';
    let data: any = null;

    // Retry loop up to 2 attempts for transient timeouts or script busy
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        const upstreamRes = await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scriptPayload),
        });

        const respText = await upstreamRes.text();

        if (isHtmlResponse(respText)) {
          lastError = 'Server is temporarily busy processing requests. Retrying automatically...';
          continue;
        }

        try {
          data = JSON.parse(respText);
        } catch {
          lastError = 'Server returned temporary non-JSON response.';
          continue;
        }

        if (data && data.status !== 'ERROR' && !data.error) {
          break;
        } else {
          lastError = data?.message || data?.error || 'Apps Script sync reported temporary delay.';
        }
      } catch (e: any) {
        lastError = e?.message || 'Network connection notice.';
      }
    }

    if (!data || data.status === 'ERROR' || data.error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: lastError || 'Server is temporarily busy processing requests.',
          result: data || { status: 'ERROR', message: lastError },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
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
