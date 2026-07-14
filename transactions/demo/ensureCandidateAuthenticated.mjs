/**
 * Gate Auth reutilizável — Agent only (não altera Runtime/Stages/Write Engine).
 *
 * ensureCandidateAuthenticated(candidate, ctx)
 *
 * 1. Se já autenticado para o MESMO e-mail → return imediato
 * 2. Senão: login → Gate Auth (poll) → confirmação
 * 3. Gate falhou → repete SOMENTE o login
 * 4. Após maxAttempts → GATE_AUTH_TIMEOUT
 *
 * @param {string|{ email: string }} candidate
 * @param {{
 *   evaluate: (fnSrc: string) => Promise<{ parsed: object|null }>,
 *   sleep: (ms: number) => Promise<void>,
 *   mark?: (step: string, extra?: object) => void,
 *   beginPhase?: (name: string) => void,
 *   checkBudgets?: () => boolean,
 *   config?: { maxAttempts?: number, gateTimeoutMs?: number, pollMs?: number },
 * }} ctx
 */
export async function ensureCandidateAuthenticated(candidate, ctx) {
  const email =
    typeof candidate === "string"
      ? candidate.trim()
      : String(candidate?.email || "").trim();
  if (!email) {
    return {
      ok: false,
      code: "INVALID_CANDIDATE",
      attempts: 0,
      elapsedMs: 0,
      criterion: null,
      authenticatedEmail: null,
      alreadyAuthenticated: false,
      detail: "email obrigatório",
    };
  }

  const evaluate = ctx.evaluate;
  const sleep = ctx.sleep;
  const mark = ctx.mark || (() => {});
  const beginPhase = ctx.beginPhase || (() => {});
  const checkBudgets = ctx.checkBudgets || (() => true);
  const config = {
    maxAttempts: Math.max(1, Number(ctx.config?.maxAttempts) || 3),
    gateTimeoutMs: Math.max(5000, Number(ctx.config?.gateTimeoutMs) || 30000),
    pollMs: Math.max(500, Number(ctx.config?.pollMs) || 2000),
  };

  const t0 = Date.now();
  const emailLocal = email.split("@")[0] || email;

  async function probeAuth() {
    return evaluate(`() => {
      const body = document.body.innerText || '';
      const bodyLc = body.toLowerCase();
      const emailLocal = ${JSON.stringify(emailLocal)}.toLowerCase();
      const emailFull = ${JSON.stringify(email)}.toLowerCase();
      const hasEntrar = /Entrar como cliente/i.test(body);
      const ola = /Olá/i.test(body);
      const emailShown = bodyLc.includes(emailLocal) || bodyLc.includes(emailFull);
      const portal = document.querySelector('.cruzeirodosul-telemarketing-2-x-portalContainer');
      const portalOpen = !!(portal && portal.offsetParent !== null);
      const loginInputVisible = !![...document.querySelectorAll('input')].find(i =>
        (i.placeholder || '') === 'Ex: example@mail.com' && i.offsetParent
      );
      const cookies = document.cookie || '';
      const hasAuthCookie = /VtexIdclientAutCookie|checkout\\.vtex\\.com|_vss|VtexIdclient/i.test(cookies);
      let storageHint = false;
      try {
        const keys = [
          ...Object.keys(localStorage || {}),
          ...Object.keys(sessionStorage || {})
        ];
        storageHint = keys.some(k => /telemarketing|customer|auth|login|impersonat/i.test(k));
      } catch {}

      const visualAuth = ola && emailShown;
      const loginUiGone = !hasEntrar && !loginInputVisible && !portalOpen;
      const sessionAuth = emailShown && !hasEntrar;
      const cookieAuth = hasAuthCookie && emailShown;
      const sameEmailAuthenticated = !!(visualAuth || sessionAuth || (loginUiGone && emailShown) || cookieAuth);
      const ready = sameEmailAuthenticated;

      return {
        ready,
        sameEmail: emailShown,
        via: ready
          ? (visualAuth ? 'visual_ola_email'
            : sessionAuth ? 'email_sem_entrar'
            : cookieAuth ? 'cookie_auth'
            : 'login_ui_gone')
          : null,
        hasEntrar,
        ola,
        emailShown,
        portalOpen,
        loginInputVisible,
        hasAuthCookie,
        storageHint,
        loginUiGone,
        href: location.href
      };
    }`);
  }

  async function performLogin() {
    await evaluate(`() => {
      const btn = document.querySelector('.cruzeirodosul-telemarketing-2-x-loginButton')
        || [...document.querySelectorAll('button')].find(b => /Entrar como cliente/i.test(b.textContent||''));
      if (btn) btn.click();
      return { ok: !!btn };
    }`);
    await sleep(700);
    await evaluate(`() => {
      const portal = document.querySelector('.cruzeirodosul-telemarketing-2-x-portalContainer');
      const input = (portal && portal.querySelector('input'))
        || [...document.querySelectorAll('input')].find(i => (i.placeholder||'') === 'Ex: example@mail.com');
      if (!input) return { ok:false };
      const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
      d.set.call(input, ${JSON.stringify(email)});
      input.dispatchEvent(new Event('input',{bubbles:true}));
      const enter = [...document.querySelectorAll('button')].find(b => /^\\s*Entrar\\s*$/i.test((b.textContent||'').trim()));
      if (enter) enter.click();
      return { ok:true };
    }`);
    await sleep(1500);
  }

  async function gateAuth(attempt) {
    beginPhase("gate_auth");
    const gateStarted = Date.now();
    let last = null;
    while (Date.now() - gateStarted < config.gateTimeoutMs) {
      if (!checkBudgets()) break;
      last = await probeAuth();
      mark("GATE_AUTH_PROBE", {
        msg: JSON.stringify({ attempt, ...(last.parsed || {}) }),
      });
      if (last.parsed?.ready && last.parsed?.sameEmail) {
        return {
          ok: true,
          via: last.parsed.via || "auth_ready",
          elapsedMs: Date.now() - gateStarted,
          probe: last.parsed,
        };
      }
      await sleep(config.pollMs);
    }
    mark("GATE_AUTH_EXPIRED", {
      msg: JSON.stringify({
        attempt,
        elapsedMs: Date.now() - gateStarted,
        last: last?.parsed || null,
      }),
    });
    return {
      ok: false,
      via: null,
      elapsedMs: Date.now() - gateStarted,
      probe: last?.parsed || null,
    };
  }

  // 1–2. Já autenticado para o MESMO e-mail?
  beginPhase("login");
  const initial = await probeAuth();
  if (initial.parsed?.ready && initial.parsed?.sameEmail) {
    const result = {
      ok: true,
      code: "OK",
      attempts: 0,
      elapsedMs: Date.now() - t0,
      criterion: initial.parsed.via || "already_authenticated",
      authenticatedEmail: email,
      alreadyAuthenticated: true,
    };
    mark("SKIP_LOGIN", {
      msg: JSON.stringify({
        via: result.criterion,
        email,
        alreadyAuthenticated: true,
      }),
    });
    return result;
  }

  let attempts = 0;
  let lastCriterion = null;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    attempts = attempt;
    beginPhase("login");
    mark("AGENT_LOGIN", {
      msg: `${email} attempt=${attempt}/${config.maxAttempts}`,
    });
    await performLogin();
    if (!checkBudgets()) {
      return {
        ok: false,
        code: "ABORTED",
        attempts,
        elapsedMs: Date.now() - t0,
        criterion: null,
        authenticatedEmail: null,
        alreadyAuthenticated: false,
      };
    }

    const gate = await gateAuth(attempt);
    if (gate.ok) {
      lastCriterion = gate.via;
      mark("GATE_AUTH_READY", {
        msg: JSON.stringify({
          attempt,
          via: gate.via,
          email,
          gateElapsedMs: gate.elapsedMs,
          totalElapsedMs: Date.now() - t0,
        }),
      });
      return {
        ok: true,
        code: "OK",
        attempts,
        elapsedMs: Date.now() - t0,
        criterion: gate.via,
        authenticatedEmail: email,
        alreadyAuthenticated: false,
      };
    }

    if (attempt < config.maxAttempts) {
      mark("GATE_AUTH_RETRY_LOGIN", {
        msg: `attempt ${attempt} failed — retry login only`,
      });
    }
  }

  mark("GATE_AUTH_TIMEOUT", {
    msg: JSON.stringify({
      attempts,
      maxAttempts: config.maxAttempts,
      email,
      elapsedMs: Date.now() - t0,
      lastCriterion,
    }),
  });

  return {
    ok: false,
    code: "GATE_AUTH_TIMEOUT",
    attempts,
    elapsedMs: Date.now() - t0,
    criterion: null,
    authenticatedEmail: null,
    alreadyAuthenticated: false,
  };
}
