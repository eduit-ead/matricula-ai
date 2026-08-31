const crypto = require("crypto");
const { config } = require("./config");
const { AppError, FlowNotHomologatedError, ValidationError } = require("./errors");
const { logEvent, redact } = require("./logger");
const { resolveCatalogFacts } = require("./catalog-service");
const { VtexClient, extractLeadId } = require("./vtex-client");
const { discoverOffer } = require("./discovery-client");
const { getFlow } = require("../flows");
const { normalizeCandidate } = require("../shared/candidate");
const { validateCandidate, emptyEnrollmentResult } = require("../shared/validators");
const { genAddressId, mapPostalCode, buildResidentialAddress } = require("../shared/address");
const checkout = require("../shared/checkout");
const { runPostOrder } = require("../shared/post-order");

function publicStep(step, status = "ok", extra = {}) {
  return {
    step,
    status,
    httpStatus: extra.httpStatus ?? null,
    durationMs: extra.durationMs ?? 0,
    errorCode: extra.errorCode || null,
  };
}

function failEnrollment(result, err, t0, type) {
  result.success = false;
  result.enrollmentCompleted = false;
  result.status = "inscricao_nao_realizada";
  result.nextAction = "retry";
  result.durationMs = Date.now() - t0;
  result.errorCode = err.code || "INSCRICAO_FAILED";
  result.message = err.message;
  result.errorStep = err.step || null;
  result.vtexResponse = err.vtexResponse || null;
  result.error = {
    code: result.errorCode,
    message: err.message,
    step: err.step || null,
    httpStatus: err.httpStatus || null,
    vtexResponse: err.vtexResponse || null,
  };
  if (err.steps?.length) {
    const seen = new Set(result.steps.map((s) => s.step));
    for (const s of err.steps) {
      if (!seen.has(s.step)) {
        result.steps.push(publicStep(s.step, s.status, s));
        seen.add(s.step);
      }
    }
  }
  logEvent({
    executionId: result.executionId,
    flowType: type,
    step: err.step || "failed",
    status: "error",
    errorCode: result.errorCode,
    durationMs: result.durationMs,
    message: err.message,
  });
  return result;
}

function summarizePayloads(payloads) {
  if (!payloads) return null;
  return redact({
    pdp: payloads.pdp || null,
    formaIngresso: payloads.input?.formaIngresso || null,
    assemblies: payloads.addToCart
      ? (payloads.addToCart.extensions && "persistedQuery")
      : payloads.setPrices
        ? Object.keys(payloads.setPrices.body || {})
        : null,
    leadPostKeys: payloads.leadPost ? Object.keys(payloads.leadPost) : null,
    enemNotes: payloads.enemNotes || null,
    setPrices: payloads.setPrices ? payloads.setPrices.body : null,
    campanha: payloads.course
      ? {
          campanhaId: payloads.course.campanhaId,
          campanhaNome: payloads.course.campanhaNome,
          codVest: payloads.course.codVest,
          seqVest: payloads.course.seqVest,
        }
      : null,
  });
}

async function runEnrollment(raw = {}, opts = {}) {
  const t0 = Date.now();
  const executionId = opts.executionId || crypto.randomUUID();
  const allowReal = opts.allowRealEnrollments ?? config.allowRealEnrollments;
  const skipPostOrder = opts.skipPostOrder ?? config.skipPostOrder;
  const type = raw.type;
  const result = emptyEnrollmentResult(type);
  result.executionId = executionId;
  let client = null;

  const push = (step, status, extra) => {
    result.steps.push(publicStep(step, status, extra));
  };

  try {
    const flow = getFlow(type);
    if (!flow) {
      throw new ValidationError(`Tipo de inscrição desconhecido: "${type}"`);
    }
    result.type = flow.id;

    const candidate = normalizeCandidate(raw.candidate || {});
    const additionalData = raw.additionalData || {};
    validateCandidate({ ...candidate, additionalData }, flow.additionalFields);

    const courseName = raw.course || raw.curso;
    const polePrefix = raw.pole || raw.polo || raw.polo_prefixo;
    if (!courseName) throw new ValidationError("Curso não informado.");
    if (!polePrefix) throw new ValidationError("Polo não informado.");
    const catalogT0 = Date.now();
    const facts = resolveCatalogFacts({
      curso: courseName,
      department: flow.department,
      polo_prefixo: polePrefix,
      cidade: additionalData.cidade,
      estado: additionalData.estado,
    });
    push("catalog_resolved", "ok", { durationMs: Date.now() - catalogT0 });
    result.catalog = { curso: facts.curso, polo: facts.polo };
    result.catalogLookupMs = facts.catalogLookupMs;

    if (flow.department && facts.curso.department && facts.curso.department !== flow.department) {
      throw new ValidationError(
        `Curso "${facts.curso.courseName}" pertence a ${facts.curso.department}, não a ${flow.department}.`
      );
    }

    let payloads = null;
    if (typeof flow.buildPayloads === "function") {
      const poloNome = additionalData.poloNome || facts.polo.poloNome2 || facts.polo.poloLabel;
      payloads = flow.buildPayloads({
        candidate,
        course: facts.curso,
        polo: facts.polo,
        additionalData: { ...additionalData, poloNome, cidade: additionalData.cidade || facts.polo.cidade },
      });
    }

    const clientCreated = opts.client || new VtexClient({
      executionId,
      flowType: flow.id,
      referer: payloads?.pdp || config.vtexBaseUrl,
      fetchImpl: opts.fetchImpl,
      muted: opts.muted,
    });
    client = clientCreated;

    let postal = null;
    if (candidate.cepRaw) {
      try {
        const json = await checkout.fetchPostalCode(client, candidate.cepRaw);
        postal = mapPostalCode(json, {
          postalCode: candidate.postalCode,
          street: candidate.street,
          neighborhood: candidate.neighborhood,
        });
        push("address_resolved", "ok");
      } catch (err) {
        push("address_resolved", "error", {
          httpStatus: err.httpStatus || null,
          errorCode: err.code || "POSTAL_CODE_FAILED",
        });
        if (allowReal) throw err;
      }
    }

    if (!allowReal) {
      let discovery = null;
      if (!opts.skipDiscovery && !flow.homologated && facts.curso.codigoCurso) {
        discovery = await discoverOffer({
          codigoCurso: facts.curso.codigoCurso,
          productRef: facts.curso.productRef,
        });
      }
      result.success = true;
      result.enrollmentCompleted = false;
      result.status = "dry_run";
      result.nextAction = flow.homologated
        ? "enable_ALLOW_REAL_ENROLLMENTS"
        : "flow_discovery_required";
      result.durationMs = Date.now() - t0;
      result.payloadPreview = summarizePayloads(payloads);
      result.address = postal;
      result.discovery = discovery;
      result.homologated = flow.homologated;
      push("dry_run", "ok");
      logEvent({
        executionId,
        flowType: flow.id,
        step: "dry_run",
        status: "ok",
        durationMs: result.durationMs,
      });
      return result;
    }

    if (!flow.homologated || typeof flow.buildPayloads !== "function") {
      throw new FlowNotHomologatedError(flow.id);
    }

    const ctx = {
      orderFormId: null,
      leadId: null,
      addressIdResidential: genAddressId(),
      addressIdSearch: genAddressId(),
    };

    await checkout.createSession(client);
    push("session_created", "ok");

    ctx.orderFormId = await checkout.createOrderForm(client);
    result.orderFormId = ctx.orderFormId;

    payloads = flow.buildPayloads({
      candidate,
      course: facts.curso,
      polo: facts.polo,
      leadId: null,
      orderFormId: ctx.orderFormId,
      additionalData: {
        ...additionalData,
        poloNome: additionalData.poloNome || facts.polo.poloNome2 || facts.polo.poloLabel,
        cidade: postal?.city || additionalData.cidade || facts.polo.cidade,
      },
    });
    client.setReferer(payloads.pdp);

    const leadRes = await client.request(
      "lead_created",
      "POST",
      `${client.baseUrl}/v1/lead/`,
      payloads.leadPost
    );
    ctx.leadId = extractLeadId(leadRes.json);
    if (!ctx.leadId) {
      throw new AppError("LEAD_ID_MISSING", "leadId ausente", { step: "lead_created", steps: client.steps });
    }
    result.leadId = ctx.leadId;
    push("lead_created", "ok");

    payloads = flow.buildPayloads({
      candidate,
      course: facts.curso,
      polo: facts.polo,
      leadId: ctx.leadId,
      orderFormId: ctx.orderFormId,
      additionalData: {
        ...additionalData,
        poloNome: payloads.input.poloNome,
        cidade: payloads.input.cidade,
        formaIngresso: payloads.input.formaIngresso,
        necessidadeEspecial: payloads.input.necessidadeEspecial,
      },
    });

    await client.request(
      "pole_configured",
      "PATCH",
      `${client.baseUrl}/v1/lead/${ctx.leadId}`,
      payloads.leadPatchPolo
    );
    push("pole_configured", "ok");

    await checkout.attachProfileInitial(client, ctx.orderFormId, candidate);

    await client.request(
      "ingress_configured",
      "PATCH",
      `${client.baseUrl}/v1/lead/${ctx.leadId}`,
      payloads.leadPatchIngresso
    );
    push("ingress_configured", "ok");

    await checkout.addToCartGql(client, payloads.addToCart);
    push("cart_created", "ok");

    const sp = payloads.setPrices;
    const spQs = new URLSearchParams(sp.query);
    let setpricesOk = false;
    for (let attempt = 1; attempt <= 3 && !setpricesOk; attempt++) {
      try {
        await client.request(
          `setprices_try${attempt}`,
          "POST",
          `${client.baseUrl}/_v/setpricescodref/${payloads.course.productRef}?${spQs}`,
          sp.body
        );
        setpricesOk = true;
      } catch (e) {
        if (attempt === 3) throw e;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    await checkout.attachBirthDate(client, ctx.orderFormId, candidate.birthDate);
    await checkout.attachProfileCpf(client, ctx.orderFormId, candidate);
    await checkout.attachPreferences(client, ctx.orderFormId);

    if (!postal) {
      const json = await checkout.fetchPostalCode(client, candidate.cepRaw);
      postal = mapPostalCode(json, {
        postalCode: candidate.postalCode,
        street: candidate.street,
        neighborhood: candidate.neighborhood,
      });
    }
    const addr = buildResidentialAddress(candidate, postal, ctx);
    await checkout.attachShipping(client, ctx.orderFormId, addr, ctx);
    await checkout.leadUpdateAddress(client, ctx.leadId, ctx.orderFormId, candidate.birthDate);

    const orderGroup = await checkout.placeTransaction(client, ctx.orderFormId);
    result.orderGroup = orderGroup;
    result.orderId = `${orderGroup}-01`;
    push("checkout_completed", "ok");

    let post = null;
    let postOrderError = null;
    if (!skipPostOrder && flow.postOrder) {
      try {
        post = await runPostOrder({
          baseUrl: client.baseUrl,
          orderGroup,
          email: candidate.email,
          fetchProva: flow.postOrder.fetchProva === true,
          tipoProva: flow.postOrder.tipoProva,
          leadOrderPutExtras: {
            cpf: candidate.cpfDigits,
            dataNascimento: `${candidate.birthDate}T00:00:00`,
            userPostalCode: addr.postalCode,
            userCity: addr.city,
            userState: addr.state,
            userStreet: addr.street,
            userAddressNumber: addr.number,
            userNeighborhood: addr.neighborhood,
          },
        });
        result.inscricaoSIAA = post.inscricaoSIAA || null;
        result.provaLink = post.provaLink || null;
        result.post = post;
      } catch (err) {
        postOrderError = err;
        if (typeof flow.afterOrder !== "function") throw err;
      }
    }

    if (typeof flow.afterOrder === "function") {
      const after = await flow.afterOrder({
        client,
        leadId: ctx.leadId,
        additionalData,
        payloads,
        candidate,
        orderId: result.orderId,
      });
      result.enemNotes = after?.notes || after;
      if (after?.inscricaoSIAA) result.inscricaoSIAA = after.inscricaoSIAA;
      if (after?.matriculaUrl) result.matriculaUrl = after.matriculaUrl;
    }
    if (postOrderError) {
      if (flow.successCriterion === "enemNotes" && result.enemNotes) {
        result.postOrderError = postOrderError.message;
      } else {
        throw postOrderError;
      }
    }
    push("enrollment_created", "ok");

    result.success = true;
    result.enrollmentCompleted = true;
    result.status = flow.successCriterion === "provaLink" && result.provaLink
      ? "completed"
      : flow.successCriterion === "provaLink"
        ? "awaiting_exam"
        : "completed";
    result.nextAction = result.provaLink ? null : flow.postOrder?.fetchProva ? "await_prova_link" : null;
    result.durationMs = Date.now() - t0;
    result.steps = [
      publicStep("catalog_resolved", "ok", { durationMs: facts.catalogLookupMs }),
      ...client.steps.map((s) => publicStep(s.step, s.status, s)),
      publicStep("enrollment_created", "ok"),
    ];
    result.course = payloads.course;
    result.address = postal;

    logEvent({
      executionId,
      flowType: flow.id,
      step: "completed",
      status: "ok",
      durationMs: result.durationMs,
    });
    return result;
  } catch (err) {
    if (client?.steps?.length) {
      err.steps = err.steps?.length ? err.steps : client.steps;
    }
    return failEnrollment(result, err, t0, type);
  }
}

module.exports = { runEnrollment };
