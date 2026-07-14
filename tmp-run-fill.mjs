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
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [mjs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("exit", (code) => {
      process.stdout.write(out);
      process.stderr.write(err);
      resolve({ code, out, err });
    });
  });
}

await run(["browser", "focus", "t34"]);

// Try fill birth alone
let r = await run([
  "browser",
  "fill",
  "--fields",
  JSON.stringify([{ ref: "e16", value: "29/09/1990" }]),
]);
if (r.code !== 0 || /Error|not found/i.test(r.err + r.out)) {
  console.log("fill e16 failed, trying type without prior click...");
  r = await run(["browser", "type", "e16", "29/09/1990"]);
}
if (r.code !== 0 || /Error|not found/i.test(r.err + r.out)) {
  console.log("type e16 failed, trying evaluate setter...");
  const fn = `() => { const labels=[...document.querySelectorAll('label')]; let el=null; for (const l of labels){ if((l.textContent||'').toLowerCase().includes('nascimento')){ const id=l.getAttribute('for'); el=id?document.getElementById(id):l.querySelector('input'); if(el) break; } } if(!el) el=document.querySelector('input[name*=\"birth\" i], input[id*=\"birth\" i], input[placeholder*=\"nascimento\" i]'); if(!el) return {ok:false, inputs:[...document.querySelectorAll('input')].filter(i=>i.offsetParent&&i.type!=='hidden').map(i=>({n:i.name,id:i.id,ph:i.placeholder,v:i.value,t:i.type}))}; const d=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value'); d.set.call(el,'29/09/1990'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('blur',{bubbles:true})); return {ok:true, value:el.value, name:el.name, id:el.id, ph:el.placeholder}; }`;
  r = await run(["browser", "evaluate", "--fn", fn]);
}

await run(["browser", "click", "e17"]);
await new Promise((r) => setTimeout(r, 5000));
r = await run([
  "browser",
  "evaluate",
  "--fn",
  "() => ({ href: location.href, title: document.title })",
]);
await run(["browser", "snapshot", "--efficient", "--limit", "60"]);
