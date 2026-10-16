interface Env {
  LLCTIMETRACKERV2_APPS_SCRIPT_URL?: string;
  APPS_SCRIPT_URL?: string;
  LLCTRACKERV2_SHARED_SECRET?: string;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    const scriptUrl = context.env.LLCTIMETRACKERV2_APPS_SCRIPT_URL || context.env.APPS_SCRIPT_URL;
    const secret = context.env.LLCTRACKERV2_SHARED_SECRET;
    if (!scriptUrl || !secret) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const payload = { secret, action: 'GET_EMPLOYEES' };
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
      data = { employees: [] };
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
    return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const scriptUrl = context.env.LLCTIMETRACKERV2_APPS_SCRIPT_URL || context.env.APPS_SCRIPT_URL;
    const secret = context.env.LLCTRACKERV2_SHARED_SECRET;
    if (!scriptUrl || !secret) {
      return new Response(JSON.stringify({ success: false, error: 'Missing environment configuration' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const payload = {
      secret,
      action: 'SYNC_EMPLOYEES',
      users: Array.isArray(body) ? body : body.users || [body],
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
      data = { status: 'SUCCESS' };
    }

    return new Response(JSON.stringify({ success: true, result: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err?.message || err }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
