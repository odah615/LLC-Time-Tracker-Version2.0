interface Env {
  LLCTIMETRACKERV2_APPS_SCRIPT_URL?: string;
  APPS_SCRIPT_URL?: string;
  LLCTRACKERV2_SHARED_SECRET?: string;
}

const isHtmlOrNonJson = (txt: string): boolean => {
  const t = (txt || '').trim().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html') || t.includes('<body');
};

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const rawQuery = String((body as any)?.usernameOrCode || '').trim();
    const password = String((body as any)?.password || '');

    if (!rawQuery || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Username/Code and password are required.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const scriptUrl = (context.env.LLCTIMETRACKERV2_APPS_SCRIPT_URL || context.env.APPS_SCRIPT_URL || '').trim();
    const secret = (context.env.LLCTRACKERV2_SHARED_SECRET || '').trim();

    if (!scriptUrl || !secret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing Cloudflare environment bindings for Apps Script URL or shared secret.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const callAppsScript = async (payloadObj: Record<string, any>, timeoutMs = 25000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadObj),
          signal: controller.signal,
        });
        const text = await res.text();
        return { ok: res.ok, status: res.status, text };
      } finally {
        clearTimeout(timeoutId);
      }
    };

    // Normalize bare numeric code (e.g. "0023" -> "LLC-0023") if needed after first attempt
    let loginIdentifier = rawQuery;
    let upstream = await callAppsScript({
      secret,
      action: 'AUTH_LOGIN',
      usernameOrCode: loginIdentifier,
      password,
    });

    if (isHtmlOrNonJson(upstream.text)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Google Apps Script returned an HTML error page. Check Apps Script deployment access ("Anyone") and URL.',
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    let data: any = null;
    try {
      data = JSON.parse(upstream.text);
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Google Apps Script returned an invalid response.',
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If agent typed email or bare digits (e.g. "0023" or "agent@email.com") and Apps Script didn't match directly,
    // resolve against GET_EMPLOYEES and retry AUTH_LOGIN with their canonical username/employeeCode.
    if (
      data?.status !== 'SUCCESS' &&
      data?.valid !== true &&
      data?.code === 'USER_NOT_FOUND' &&
      (rawQuery.includes('@') || /^\d{1,6}$/.test(rawQuery))
    ) {
      const empRes = await callAppsScript({ secret, action: 'GET_EMPLOYEES' }, 15000).catch(() => null);
      if (empRes && !isHtmlOrNonJson(empRes.text)) {
        try {
          const empJson = JSON.parse(empRes.text);
          const employees = Array.isArray(empJson?.employees) ? empJson.employees : [];
          const qLower = rawQuery.toLowerCase();
          const qDigits = rawQuery.replace(/\D/g, '');
          const matchedEmp = employees.find((e: any) => {
            const eEmail = String(e.email || '').trim().toLowerCase();
            const eCode = String(e.employeeCode || '').trim().toUpperCase();
            const eDigits = eCode.replace(/\D/g, '');
            if (eEmail && eEmail === qLower) return true;
            if (qDigits && eDigits && (eDigits === qDigits || Number(eDigits) === Number(qDigits))) return true;
            return false;
          });
          if (matchedEmp) {
            loginIdentifier = matchedEmp.username || matchedEmp.employeeCode;
            const retryRes = await callAppsScript({
              secret,
              action: 'AUTH_LOGIN',
              usernameOrCode: loginIdentifier,
              password,
            });
            if (!isHtmlOrNonJson(retryRes.text)) {
              data = JSON.parse(retryRes.text);
            }
          }
        } catch {}
      }
    }

    if (data && (data.status === 'SUCCESS' || data.valid === true)) {
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
    }

    // Distinguish Apps Script config/execution errors from genuine credential rejections
    const code = String(data?.code || '').toUpperCase();
    if (code === 'UNAUTHORIZED') {
      return new Response(
        JSON.stringify({
          success: false,
          code,
          error: 'Server configuration error: LLCTRACKERV2_SHARED_SECRET does not match Google Apps Script.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (code === 'SCRIPT_EXCEPTION' || code === 'BUSY') {
      return new Response(
        JSON.stringify({
          success: false,
          code,
          error: data?.message || 'Google Apps Script is temporarily busy. Please try again.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: false,
        code: data?.code || 'INVALID_CREDENTIALS',
        error: data?.message || data?.error || 'Login rejected: Invalid credentials.',
      }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const isAbort = err?.name === 'AbortError';
    return new Response(
      JSON.stringify({
        success: false,
        error: isAbort
          ? 'Authentication server timed out waiting for Google Sheets. Please try signing in again.'
          : `Authentication proxy error: ${err?.message || err}`,
      }),
      { status: isAbort ? 504 : 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
