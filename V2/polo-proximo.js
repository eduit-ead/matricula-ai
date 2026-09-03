/**
 * Polo_Inscicao = "polo mais próximo": CEP → lat/lng → polo_loc (Supabase) → poleId.
 * Coordenadas do CEP: Google Geocode se houver GOOGLE_MAPS_API_KEY; senão VTEX (mesmo CEP já validado).
 */
const { CatalogError } = require("./catalog-resolver");
const { norm, POLO_INSCRICAO } = require("./kommo-map");

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://vtlbndvcgajcoajhcnnx.supabase.co").replace(/\/$/, "");
const GEOCODE_URL = process.env.GOOGLE_GEOCODE_URL || "https://maps.googleapis.com/maps/api/geocode/json";

const NOME_DB_TO_SLUG = {
  "polo morumbi": "morumbi",
  "polo sapopemba": "sapopemba",
  "polo freguesia do o": "freguesia",
  "polo vila prudente": "vila prudente 2",
  "polo vila prudente 2": "vila prudente 2",
  "polo santana 2": "santana 2",
  "polo barra funda": "barra funda",
  "polo taboao mituzi": "taboao mituzi",
  "polo campinas": "campinas",
  "polo capivari": "capivari",
  "polo taboao centro": "taboao centro",
  "polo ibirapuera/moema": "ibirapuera",
  "polo ibirapuera": "ibirapuera",
  "polo itapira": "itapira",
  "polo vila mariana": "vila mariana",
};

function isPoloMaisProximo(raw) {
  return norm(raw) === "polo mais proximo";
}

function supabaseKey() {
  return process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || "";
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function slugFromNome(nome) {
  return NOME_DB_TO_SLUG[norm(nome)] || "";
}

async function loadPolosLoc() {
  const key = supabaseKey();
  if (!key) {
    throw new CatalogError(
      "POLO_LOC_SEM_CHAVE",
      "Defina SUPABASE_ANON_KEY no EasyPanel para resolver polo mais próximo."
    );
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/polo_loc?select=nome,latitude,longitude`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new CatalogError("POLO_LOC_ERRO", `Supabase polo_loc ${res.status}: ${text.slice(0, 180)}`);
  }
  const rows = JSON.parse(text);
  if (!Array.isArray(rows) || !rows.length) {
    throw new CatalogError("POLO_LOC_VAZIO", "Tabela polo_loc sem linhas.");
  }
  return rows;
}

async function geocodeGoogle(cep8) {
  const key = process.env.GOOGLE_MAPS_API_KEY || "";
  if (!key) return null;
  const url = `${GEOCODE_URL}?address=${encodeURIComponent(`${cep8}, Brazil`)}&key=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.status !== "OK" || !json.results?.[0]?.geometry?.location) {
    throw new CatalogError(
      "CEP_GEO_GOOGLE",
      `Google Geocode falhou para ${cep8}: ${json.status || res.status} ${json.error_message || ""}`.trim()
    );
  }
  const { lat, lng } = json.results[0].geometry.location;
  return { lat, lng, fonte: "google" };
}

function geocodeFromVtex(vtexPostal) {
  const geo = vtexPostal?.geoCoordinates;
  if (!Array.isArray(geo) || geo.length < 2) return null;
  const lng = Number(geo[0]);
  const lat = Number(geo[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng, fonte: "vtex" };
}

async function resolvePoloMaisProximo(cep8, vtexPostal = null) {
  const ponto = (await geocodeGoogle(cep8)) || geocodeFromVtex(vtexPostal);
  if (!ponto) {
    throw new CatalogError(
      "CEP_SEM_COORDENADA",
      `Não achei lat/lng para o CEP ${cep8}. Defina GOOGLE_MAPS_API_KEY ou use um CEP que a VTEX geocode.`
    );
  }

  const rows = await loadPolosLoc();
  let best = null;
  for (const row of rows) {
    const slug = slugFromNome(row.nome);
    const mapped = slug && POLO_INSCRICAO[slug];
    if (!mapped) continue;
    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const km = haversineKm(ponto.lat, ponto.lng, lat, lng);
    if (!best || km < best.km) {
      best = { ...mapped, km, nomeDb: row.nome, fonteGeo: ponto.fonte };
    }
  }
  if (!best) {
    throw new CatalogError("POLO_LOC_SEM_MAPA", "Nenhum polo_loc mapeia para Polos.xlsx.");
  }
  return best;
}

module.exports = {
  isPoloMaisProximo,
  resolvePoloMaisProximo,
};
