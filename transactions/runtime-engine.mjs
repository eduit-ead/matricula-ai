/** In-page evaluate engine (nativeReact backend). */

export function buildInPageEngineSource(definition, values) {
  const payload = { definition, values };
  return `() => {
  const INPUT = ${JSON.stringify(payload)};
  const def = INPUT.definition;
  const rawValues = INPUT.values || {};
  const errors = [];
  const valuesFound = {};
  const strategiesUsed = {};
  const confidenceParts = [];
  let anchor = null;

  const visible = (el) => !!(el && el.offsetParent && el.type !== "hidden");

  const normFns = {
    trim: (v) => String(v ?? "").trim(),
    lowerCase: (v) => String(v ?? "").trim().toLowerCase(),
    titleCase: (v) =>
      String(v ?? "")
        .trim()
        .split(/\\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" "),
    digitsOnly: (v) => String(v ?? "").replace(/\\D/g, ""),
  };

  const normalizeValue = (v, list) => {
    let out = v;
    for (const n of list || []) {
      if (normFns[n]) out = normFns[n](out);
    }
    return out;
  };

  const labelTextFor = (el) => {
    if (!el) return "";
    if (el.id) {
      const lab = document.querySelector('label[for="' + String(el.id).replace(/"/g, "") + '"]');
      if (lab) return (lab.textContent || "").toLowerCase();
    }
    const wrap = el.closest("label");
    return wrap ? (wrap.textContent || "").toLowerCase() : "";
  };

  const textBag = (el) =>
    (
      (el.getAttribute("aria-label") || "") +
      " " +
      (el.placeholder || "") +
      " " +
      (el.name || "") +
      " " +
      (el.id || "") +
      " " +
      labelTextFor(el)
    ).toLowerCase();

  const dist = (a, b) => {
    if (!a || !b) return 99999;
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return Math.abs(ra.top - rb.top) + Math.abs(ra.left - rb.left) * 0.25;
  };

  const fail = (code, message, field, extra) => {
    errors.push({ code, message, field: field || null, ...(extra || {}) });
  };

  // --- preconditions ---
  const pre = def.preconditions || {};
  if (pre.requireVisibleButtonTextAny && pre.requireVisibleButtonTextAny.length) {
    const okBtn = [...document.querySelectorAll("button")].some(
      (b) =>
        visible(b) &&
        pre.requireVisibleButtonTextAny.some((t) =>
          (b.textContent || "").trim().toLowerCase().includes(String(t).toLowerCase())
        )
    );
    if (!okBtn) {
      fail("NOT_ON_STAGE", "Preconditions failed: required button text not visible");
      return finish(false);
    }
  }
  if (pre.requireVisibleInputNameAny && pre.requireVisibleInputNameAny.length) {
    const okInput = [...document.querySelectorAll("input")].some(
      (i) =>
        visible(i) &&
        pre.requireVisibleInputNameAny.some(
          (n) => String(i.name || "").toLowerCase() === String(n).toLowerCase()
        )
    );
    if (!okInput) {
      fail("NOT_ON_STAGE", "Preconditions failed: required inputs not visible");
      return finish(false);
    }
  }

  // --- anchor ---
  const an = def.anchor || {};
  if (an.strategy === "buttonText") {
    const wants = [];
    if (an.match && an.match.equalsIgnoreCase) wants.push(an.match.equalsIgnoreCase);
    if (an.match && an.match.equalsIgnoreCaseAny)
      wants.push(...an.match.equalsIgnoreCaseAny);
    const wantSet = wants.map((w) => String(w).toLowerCase());
    anchor = [...document.querySelectorAll("button")].find((b) => {
      if (!visible(b)) return false;
      if (an.excludeTag && String(b.tagName).toLowerCase() === String(an.excludeTag).toLowerCase())
        return false;
      const t = (b.textContent || "").trim().toLowerCase();
      return wantSet.some((w) => t === w || t.includes(w));
    });
    if (!anchor && an.fallbackCssIncludes && an.fallbackCssIncludes.length) {
      anchor = [...document.querySelectorAll("button")].find((b) => {
        if (!visible(b)) return false;
        const cls = String(b.className || "").toLowerCase();
        return an.fallbackCssIncludes.some((p) => cls.includes(String(p).toLowerCase()));
      });
    }
  }
  if (!anchor && an.strategy) {
    fail("ANCHOR_NOT_FOUND", "Anchor not found for stage");
    return finish(false);
  }

  const scoreStrategy = (el, strat) => {
    const t = textBag(el);
    let s = 0;
    if (strat.type === "labelText") {
      const lab = labelTextFor(el);
      if ((strat.includesAny || []).some((x) => lab.includes(String(x).toLowerCase()))) s += 5;
      else if ((strat.includesAny || []).some((x) => t.includes(String(x).toLowerCase()))) s += 3;
    } else if (strat.type === "placeholder") {
      const ph = (el.placeholder || "").toLowerCase();
      if ((strat.includesAny || []).some((x) => ph.includes(String(x).toLowerCase()))) s += 4;
    } else if (strat.type === "ariaLabel") {
      const ar = (el.getAttribute("aria-label") || "").toLowerCase();
      if ((strat.includesAny || []).some((x) => ar.includes(String(x).toLowerCase()))) s += 4;
    } else if (strat.type === "inputType") {
      if ((el.type || "") === strat.equals) s += 4;
    } else if (strat.type === "attrName") {
      const n = (el.name || "").toLowerCase();
      if ((strat.equalsAny || []).some((x) => n === String(x).toLowerCase())) s += 3;
    }
    return s;
  };

  const locateInput = (locateCfg, controlHint) => {
    const inputs = [...document.querySelectorAll("input")].filter(
      (i) => visible(i) && i.type !== "checkbox" && i.type !== "radio"
    );
    const strats = locateCfg.strategies || [];
    const ranked = inputs
      .map((el) => {
        let score = 0;
        const used = [];
        for (const st of strats) {
          const sc = scoreStrategy(el, st);
          if (sc > 0) {
            score += sc;
            used.push(st.type);
          }
        }
        if (locateCfg.penalizePlaceholderIncludes) {
          const ph = (el.placeholder || "").toLowerCase();
          for (const p of locateCfg.penalizePlaceholderIncludes) {
            if (ph.includes(String(p).toLowerCase())) score -= 10;
          }
        }
        const d = locateCfg.preferNearAnchor && anchor ? dist(el, anchor) : 0;
        return { el, score, dist: d, used };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.dist - b.dist);
    return ranked[0] || null;
  };

  const locateCheckbox = (locateCfg) => {
    const checks = [...document.querySelectorAll('input[type="checkbox"]')].filter(visible);
    const strats = locateCfg.strategies || [];
    let best = null;
    for (const el of checks) {
      let score = 0;
      const used = [];
      const blob =
        labelTextFor(el) +
        " " +
        ((el.closest("label") && el.closest("label").textContent) || "") +
        " " +
        ((el.parentElement && el.parentElement.innerText) || "");
      const low = blob.toLowerCase();
      for (const st of strats) {
        if (st.type === "labelText") {
          if ((st.includesAny || []).some((x) => low.includes(String(x).toLowerCase()))) {
            score += 5;
            used.push("labelText");
          }
        }
      }
      const d = locateCfg.preferNearAnchor && anchor ? dist(el, anchor) : 0;
      if (score > 0 && (!best || score > best.score || (score === best.score && d < best.dist))) {
        best = { el, score, dist: d, used };
      }
    }
    if (!best && locateCfg.fallbackClosestToAnchor && anchor) {
      const sorted = checks
        .map((el) => ({ el, score: 1, dist: dist(el, anchor), used: ["fallbackClosestToAnchor"] }))
        .sort((a, b) => a.dist - b.dist);
      best = sorted[0] || null;
    }
    return best;
  };

  const reactSafeSet = (el, v) => {
    if (!el) return false;
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    el.focus();
    try {
      el.select();
    } catch (_) {}
    const prev = el.value;
    try {
      const tracker = el._valueTracker;
      if (tracker) tracker.setValue(prev === String(v) ? prev + "_" : prev || "");
    } catch (_) {}
    desc.set.call(el, v);
    el.dispatchEvent(
      new InputEvent("input", { bubbles: true, data: String(v), inputType: "insertText" })
    );
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      const pk = Object.keys(el).find((k) => k.startsWith("__reactProps"));
      const props = pk && el[pk];
      if (props && props.onChange) {
        const synth = {
          target: { value: String(v), name: el.name, type: el.type },
          currentTarget: { value: String(v), name: el.name, type: el.type },
          preventDefault() {},
          stopPropagation() {},
          persist() {},
        };
        props.onChange(synth);
        if (props.onBlur) props.onBlur(synth);
      }
    } catch (_) {}
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  };

  const runValidations = (fieldKey, el, expectedNorm, rules, foundRaw) => {
    const list = rules || [];
    for (const rule of list) {
      if (rule.rule === "nonEmpty") {
        if (!String(foundRaw || "").trim())
          fail("NOT_ACCEPTED", "Empty value", fieldKey, { value: foundRaw });
      } else if (rule.rule === "minWords") {
        const n = String(foundRaw || "")
          .trim()
          .split(/\\s+/)
          .filter(Boolean).length;
        if (n < (rule.count || 2))
          fail("INVALID_INPUT", "minWords not met", fieldKey, { value: foundRaw });
      } else if (rule.rule === "emailFormat") {
        if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(foundRaw || "").trim()))
          fail("INVALID_INPUT", "emailFormat failed", fieldKey, { value: foundRaw });
      } else if (rule.rule === "equalsNormalized") {
        const a = String(foundRaw || "").trim().toLowerCase();
        const b = String(expectedNorm || "").trim().toLowerCase();
        if (fieldKey === "email") {
          if (a !== b)
            fail("NOT_ACCEPTED", "email mismatch", fieldKey, {
              value: foundRaw,
              expected: expectedNorm,
            });
        } else {
          const first = b.split(/\\s+/).filter(Boolean)[0] || "";
          if (!a || (first && !a.includes(first)))
            fail("NOT_ACCEPTED", "value mismatch", fieldKey, {
              value: foundRaw,
              expected: expectedNorm,
            });
        }
      } else if (rule.rule === "minDigits") {
        const d = String(foundRaw || "").replace(/\\D/g, "");
        if (d.length < (rule.count || 10))
          fail("NOT_ACCEPTED", "minDigits not met", fieldKey, { value: foundRaw });
      } else if (rule.rule === "endsWithLastDigits") {
        const d = String(foundRaw || "").replace(/\\D/g, "");
        const exp = String(expectedNorm || "").replace(/\\D/g, "");
        const n = rule.count || 8;
        if (!d.endsWith(exp.slice(-n)))
          fail("NOT_ACCEPTED", "digits suffix mismatch", fieldKey, { value: foundRaw });
      } else if (rule.rule === "isChecked") {
        if (!(el && el.checked) && foundRaw !== true)
          fail("NOT_ACCEPTED", "checkbox not checked", fieldKey);
      }
    }
  };

  // --- fields ---
  for (const field of def.fields || []) {
    const expected = normalizeValue(rawValues[field.key], (field.write && field.write.normalize) || []);
    if (field.validate && field.validate.some((r) => r.rule === "minWords" || r.rule === "emailFormat")) {
      if (field.key === "nome" && String(expected).split(/\\s+/).filter(Boolean).length < 2) {
        fail("INVALID_INPUT", "nome must have at least 2 words", field.key);
        valuesFound[field.key] = null;
        confidenceParts.push(0);
        continue;
      }
      if (field.key === "email" && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(expected))) {
        fail("INVALID_INPUT", "email invalid in payload", field.key);
        valuesFound[field.key] = null;
        confidenceParts.push(0);
        continue;
      }
    }

    // try top candidates near anchor until write sticks when possible
    const locateCfg = field.locate || {};
    const inputs = [...document.querySelectorAll("input")].filter(
      (i) => visible(i) && i.type !== "checkbox" && i.type !== "radio"
    );
    const strats = locateCfg.strategies || [];
    const ranked = inputs
      .map((el) => {
        let score = 0;
        const used = [];
        for (const st of strats) {
          const sc = scoreStrategy(el, st);
          if (sc > 0) {
            score += sc;
            used.push(st.type);
          }
        }
        if (locateCfg.penalizePlaceholderIncludes) {
          const ph = (el.placeholder || "").toLowerCase();
          for (const p of locateCfg.penalizePlaceholderIncludes) {
            if (ph.includes(String(p).toLowerCase())) score -= 10;
          }
        }
        const d = locateCfg.preferNearAnchor && anchor ? dist(el, anchor) : 0;
        return { el, score, dist: d, used };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.dist - b.dist)
      .slice(0, 4);

    if (!ranked.length) {
      fail("NOT_FOUND", "Field not located", field.key);
      valuesFound[field.key] = null;
      confidenceParts.push(0);
      strategiesUsed[field.key] = [];
      continue;
    }

    let chosen = null;
    for (const cand of ranked) {
      if ((field.write && field.write.mode) === "reactSafeSet") {
        reactSafeSet(cand.el, expected);
      }
      const raw = cand.el.value;
      const okEnough =
        field.key === "email"
          ? String(raw || "").toLowerCase() === String(expected).toLowerCase()
          : field.key === "telefone"
            ? String(raw || "")
                .replace(/\\D/g, "")
                .endsWith(String(expected).replace(/\\D/g, "").slice(-8))
            : !!(raw && String(raw).length >= 2);
      if (okEnough) {
        if (!chosen || cand.dist < chosen.dist) chosen = cand;
      }
    }
    if (!chosen) chosen = ranked[0];

    strategiesUsed[field.key] = chosen.used;
    confidenceParts.push(Math.min(1, chosen.score / 8));
    valuesFound[field.key] = chosen.el.value;
    runValidations(field.key, chosen.el, expected, field.validate, chosen.el.value);
  }

  // Prefer values from controls closest to anchor matching attr strategies (purchase box)
  if (anchor) {
    for (const field of def.fields || []) {
      const near = [...document.querySelectorAll("input")]
        .filter((i) => visible(i) && i.type !== "checkbox")
        .filter((el) => {
          let score = 0;
          for (const st of field.locate.strategies || []) score += scoreStrategy(el, st);
          return score > 0;
        })
        .sort((a, b) => dist(a, anchor) - dist(b, anchor))[0];
      if (near && near.value) valuesFound[field.key] = near.value;
    }
  }

  // Re-validate after near-anchor preference
  errors.length = 0;
  for (const field of def.fields || []) {
    const expected = normalizeValue(rawValues[field.key], (field.write && field.write.normalize) || []);
    const found = valuesFound[field.key];
    const el = null;
    runValidations(field.key, el, expected, field.validate, found);
  }

  // --- checkboxes ---
  for (const box of def.checkboxes || []) {
    const hit = locateCheckbox(box.locate || {});
    if (!hit) {
      fail("NOT_FOUND", "Checkbox not located", box.key);
      valuesFound[box.key] = false;
      confidenceParts.push(0);
      strategiesUsed[box.key] = [];
      continue;
    }
    strategiesUsed[box.key] = hit.used;
    confidenceParts.push(Math.min(1, hit.score / 5));
    if ((box.write && box.write.mode) === "ensureChecked" && !hit.el.checked) {
      hit.el.click();
    }
    valuesFound[box.key] = !!hit.el.checked;
    runValidations(box.key, hit.el, true, box.validate, hit.el.checked);
  }

  function finish(forcedSuccess) {
    const fieldKeys = (def.fields || []).map((f) => f.key);
    const boxKeys = (def.checkboxes || []).map((c) => c.key);
    const hasFieldErr = errors.some((e) => fieldKeys.includes(e.field));
    const hasBoxErr = errors.some((e) => boxKeys.includes(e.field));
    const successCfg = def.success || {};
    let success =
      forcedSuccess === false
        ? false
        : errors.filter((e) => e.code === "NOT_ON_STAGE" || e.code === "ANCHOR_NOT_FOUND").length === 0;

    if (successCfg.allFieldsValid && hasFieldErr) success = false;
    if (successCfg.allCheckboxesValid && hasBoxErr) success = false;
    if (errors.some((e) => e.code === "NOT_ON_STAGE" || e.code === "ANCHOR_NOT_FOUND")) success = false;
    if (errors.some((e) => e.code === "NOT_FOUND")) success = false;
    if (errors.length && forcedSuccess !== true) {
      // keep success false if any NOT_ACCEPTED / INVALID
      if (errors.some((e) => e.code === "NOT_ACCEPTED" || e.code === "INVALID_INPUT")) success = false;
    }
    if (!errors.length) success = true;

    let confidence = 0;
    if (confidenceParts.length) {
      confidence = confidenceParts.reduce((a, b) => a + b, 0) / confidenceParts.length;
    }
    if (!success) confidence = Math.min(confidence, 0.45);

    const map = def.onFailureSuggest || {};
    let nextActionSuggested = def.onSuccessSuggest || null;
    if (!success) {
      const primary = errors[0] && errors[0].code;
      nextActionSuggested = map[primary] || map.default || "retry_stage_or_ask_human";
    }

    return {
      success,
      confidence: Math.round(confidence * 100) / 100,
      errors,
      valuesFound,
      nextActionSuggested,
      stageId: def.id,
      version: def.version,
      diagnostics: { strategiesUsed, anchorFound: !!anchor },
    };
  }

  return finish();
}`;
}

