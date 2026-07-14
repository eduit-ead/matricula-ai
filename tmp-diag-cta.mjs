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
const fn = `() => {
  const body = (document.body.innerText || "").slice(0, 2500);
  const btn = document.querySelector(
    "button.cruzeirodosul-product-purchase-box-0-x-cta_p1"
  );
  const inputs = [...document.querySelectorAll("input")]
    .filter((i) => i.offsetParent && /completeName|email|cellphone|checkbox/i.test(i.name + i.type))
    .map((i) => ({
      name: i.name,
      type: i.type,
      value: (i.value || "").slice(0, 40),
      checked: i.checked,
    }));
  const alerts = [...document.querySelectorAll('[class*="error"],[class*="Error"],[role="alert"]')]
    .map((e) => (e.textContent || "").trim())
    .filter(Boolean)
    .slice(0, 10);
  return {
    href: location.href,
    btn: btn
      ? {
          text: (btn.textContent || "").trim(),
          disabled: btn.disabled,
          aria: btn.getAttribute("aria-disabled"),
        }
      : null,
    inputs,
    alerts,
    hasPolo: /Selecione um Pa|Digite seu CEP|Selecione um Polo/i.test(body),
    snippets: body
      .split(/\\n/)
      .map((l) => l.trim())
      .filter((l) => /obrigat|inválid|erro|privacidade|inscreva|cep|polo/i.test(l))
      .slice(0, 20),
  };
}`;
const r = await run(["browser", "evaluate", "--fn", fn]);
console.log(r.out || r.err);
