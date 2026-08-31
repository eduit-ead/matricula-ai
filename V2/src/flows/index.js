const graduacaoMultipla = require("./graduacao-multipla");
const graduacaoRedacao = require("./graduacao-redacao");
const graduacaoEnem = require("./graduacao-enem");
const graduacaoTransferencia = require("./graduacao-transferencia");
const graduacaoSegunda = require("./graduacao-segunda");
const pos = require("./pos");

const FLOWS = [
  graduacaoMultipla,
  graduacaoRedacao,
  graduacaoEnem,
  graduacaoTransferencia,
  graduacaoSegunda,
  pos,
];

const BY_ID = new Map(FLOWS.map((f) => [f.id, f]));

function listFlows() {
  return FLOWS.map((f) => ({
    id: f.id,
    label: f.label,
    department: f.department,
    homologated: f.homologated,
    additionalFields: f.additionalFields || [],
    successCriterion: f.successCriterion,
    discoveryNotes: f.discoveryNotes || null,
  }));
}

function getFlow(type) {
  return BY_ID.get(type) || null;
}

module.exports = { FLOWS, listFlows, getFlow };
