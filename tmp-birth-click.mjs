import { spawn } from "child_process";
import path from "path";

const mjs = path.join(
  process.env.APPDATA,
  "npm",
  "node_modules",
  "openclaw",
  "openclaw.mjs"
);

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => resolve({ code, out, err }));
  });
}

await run(["browser", "focus", "t34"]);

const inspect = `() => {
  const birth = document.getElementById('client-birthDate');
  const captchaIframes = [...document.querySelectorAll('iframe')].map(f => ({src:f.src, title:f.title, id:f.id})).filter(f => /recaptcha|hcaptcha|captcha|challenge/i.test(f.src+f.title+f.id));
  const captchaBoxes = [...document.querySelectorAll('[class*=\"recaptcha\"], [id*=\"recaptcha\"], .g-recaptcha, [data-sitekey]')].map(e => ({tag:e.tagName, id:e.id, className:e.className, html:e.outerHTML.slice(0,200)}));
  const errors = [...document.querySelectorAll('.error, [class*=\"error\"], [role=alert], .help')]
    .map(e => (e.textContent||'').trim().replace(/\\s+/g,' ')).filter(t => t && t.length < 200).slice(0,15);
  return {
    birth: birth ? { value: birth.value, validity: birth.validationMessage, className: birth.className } : null,
    captchaIframes,
    captchaBoxes,
    errors
  };
}`;

let r = await run(["browser", "evaluate", "--fn", inspect]);
console.log(r.out || r.err);

r = await run(["browser", "click", "e17"]);
console.log("CLICK:", r.out || r.err);
await new Promise((x) => setTimeout(x, 4000));

r = await run(["browser", "evaluate", "--fn", "() => ({ href: location.href, title: document.title })"]);
console.log(r.out || r.err);

const inspect2 = `() => {
  const birth = document.getElementById('client-birthDate');
  const errors = [...document.querySelectorAll('.error, [class*=\"error\"], [role=alert], .help')]
    .map(e => (e.textContent||'').trim().replace(/\\s+/g,' ')).filter(t => t && t.length < 200).slice(0,15);
  return { birth: birth && birth.value, errors };
}`;
r = await run(["browser", "evaluate", "--fn", inspect2]);
console.log("AFTER:", r.out || r.err);
