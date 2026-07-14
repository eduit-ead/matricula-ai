() => {
  const set = (el, v) => {
    if (!el) return false;
    const desc = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    );
    desc.set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  };

  const findByLabel = (hint) => {
    const h = hint.toLowerCase();
    for (const lab of document.querySelectorAll("label")) {
      if ((lab.textContent || "").toLowerCase().includes(h)) {
        const id = lab.getAttribute("for");
        if (id) {
          const el = document.getElementById(id);
          if (el) return el;
        }
        const nested = lab.querySelector("input");
        if (nested) return nested;
      }
    }
    return [...document.querySelectorAll("input")].find((i) =>
      ((i.placeholder || "") + (i.name || "") + (i.id || ""))
        .toLowerCase()
        .includes(h)
    );
  };

  const first = findByLabel("Primeiro nome") || findByLabel("firstName");
  const last = findByLabel("Último nome") || findByLabel("lastName");
  const cpf = findByLabel("CPF");
  const phone = findByLabel("Telefone") || findByLabel("phone");
  const birth =
    findByLabel("nascimento") ||
    findByLabel("birth") ||
    document.querySelector('input[name*="birth" i]');

  const result = {
    setFirst: set(first, "Fabio"),
    setLast: set(last, "Villas"),
    setCpf: set(cpf, "22714223028"),
    setPhone: set(phone, "11987124916"),
    setBirth: set(birth, "29/09/1990"),
    values: {
      first: first && first.value,
      last: last && last.value,
      cpf: cpf && cpf.value,
      phone: phone && phone.value,
      birth: birth && birth.value,
      firstName: first && (first.name || first.id),
      birthName: birth && (birth.name || birth.id || birth.placeholder),
    },
  };
  return result;
}
