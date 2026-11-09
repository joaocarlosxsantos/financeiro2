const CITIES = new Set([
  "SAO PAULO", "BARUERI", "CURITIBA", "RIO DE JANEIRO", "BELO HORIZONTE", "PORTO ALEGRE",
  "BRASILIA", "CAMPINAS", "OSASCO", "SANTO ANDRE", "SANTOS", "RECIFE", "SALVADOR",
  "FORTALEZA", "GOIANIA", "FLORIANOPOLIS", "NITEROI", "GUARULHOS", "JUNDIAI",
]);

export type NormalizedDescription = {
  key: string;
  providerDescription: string;
  rail: "PIX_SENT" | "PIX_RECEIVED" | "PIX_TRANSFER" | "TED" | "DOC" | "OTHER";
};

function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function removeSensitiveTokens(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, " ")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, " ")
    .replace(/\b(?:CPF|CNPJ|CHAVE\s+PIX|CONTA|AGENCIA|AG)\s*[:#-]?\s*[A-Z0-9._/@-]{3,}/gi, " ")
    .replace(/\b\+?\d[\d ()-]{8,}\d\b/g, " ");
}

function stripNoise(value: string): string {
  return value
    .replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\b/g, " ")
    .replace(/\b(?:PARC(?:ELA)?\s*)?\(?\d{1,2}\s*\/\s*\d{1,2}\)?\b/g, " ")
    .replace(/\bPARC(?:ELA)?\b/g, " ")
    .replace(/\b\d{2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/\b\d{6,}\b/g, " ");
}

function canonicalizePrefix(value: string): { text: string; rail: NormalizedDescription["rail"] } {
  let text = value;
  let rail: NormalizedDescription["rail"] = "OTHER";
  if (/^PIX\s+(?:TRANSF|TRANSFERENCIA)\b/.test(text)) {
    text = text.replace(/^PIX\s+(?:TRANSF|TRANSFERENCIA)\b/, "PIX TRANSFERENCIA");
    rail = "PIX_TRANSFER";
  } else if (/^PIX\s+(?:ENVIAD[AO]|SAIDA)\b/.test(text)) {
    text = text.replace(/^PIX\s+(?:ENVIAD[AO]|SAIDA)\b/, "PIX ENVIADO");
    rail = "PIX_SENT";
  } else if (/^PIX\s+(?:RECEBID[AO]|ENTRADA)\b/.test(text)) {
    text = text.replace(/^PIX\s+(?:RECEBID[AO]|ENTRADA)\b/, "PIX RECEBIDO");
    rail = "PIX_RECEIVED";
  } else if (/^TED\b/.test(text)) rail = "TED";
  else if (/^DOC\b/.test(text)) rail = "DOC";

  text = text
    .replace(/^COMPRA\s+(?:NO\s+)?CART(?:A|Ã)O\s+(?:\d{2}[/-]\d{2}(?:[/-]\d{2,4})?\s+)?/, "COMPRA CARTAO ")
    .replace(/^COMPRA\s+(?:VISA|MASTERCARD|ELO|ELECTRON)\s+/, "COMPRA CARTAO ")
    .replace(/^DEB(?:ITO)?\s+AUT(?:OMATICO)?\s+/, "DEBITO AUTOMATICO ")
    .replace(/^SISDEB\s+/, "DEBITO AUTOMATICO ")
    .replace(/^PAG(?:AMENTO)?\s+BOLETO\s+/, "BOLETO ")
    .replace(/^TED\s+(?:RECEBIDA|RECEBIDO|ENVIADA|ENVIADO)?\s*\d{2,3}\s*\/\s*\d+\s+/, "TED ")
    .replace(/^TED\s+(?:RECEBIDA|RECEBIDO|ENVIADA|ENVIADO)\s+/, "TED ")
    .replace(/^DOC\s+\d+\s+/, "DOC ");

  const acquirers: Array<[RegExp, string]> = [
    [/^IFD\s*\*\s*/, "IFOOD "], [/^IFOOD\s*\*\s*/, "IFOOD "],
    [/^(?:MP|MERCADOPAGO|MERCADO\s+PAGO)\s*\*\s*/, "MERCADO PAGO "],
    [/^(?:PAG|PAGSEGURO|PAGBANK)\s*\*\s*/, "PAGSEGURO "],
    [/^(?:UBER\s*\*\s*)EATS\s*/, "UBER EATS "], [/^UBER\s*\*\s*TRIP\s*/, "UBER "] ,
    [/^(?:STN|STONE)\s*\*\s*/, "STONE "], [/^(?:CIE|CIELO)\s*\*\s*/, "CIELO "],
    [/^(?:GETNET|REDECARD|REDE|SUMUP|PAYPAL)\s*\*\s*/, ""],
  ];
  for (const [pattern, replacement] of acquirers) {
    if (pattern.test(text)) { text = text.replace(pattern, replacement); break; }
  }
  return { text, rail };
}

export function normalizeDescription(description: string): NormalizedDescription {
  const safeInput = removeSensitiveTokens(description);
  let text = fold(stripNoise(safeInput)).replace(/[|]+/g, " ").replace(/[^A-Z0-9*]+/g, " ").replace(/\s+/g, " ").trim();
  const prefix = canonicalizePrefix(text);
  text = prefix.text.replace(/\*/g, " ").replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const tokens = text.split(" ");
  for (const city of [...CITIES].sort((a, b) => b.length - a.length)) {
    const cityParts = city.split(" ");
    const suffix = tokens.slice(-(cityParts.length + 1));
    if ((suffix.at(-1) === "BRA" || suffix.at(-1) === "BR") && suffix.slice(0, -1).join(" ") === city) {
      tokens.splice(-(cityParts.length + 1));
      break;
    }
    if (tokens.slice(-cityParts.length).join(" ") === city) {
      tokens.splice(-cityParts.length);
      break;
    }
  }
  const key = tokens.join(" ").replace(/\s+/g, " ").trim();
  let providerDescription = key;
  if (prefix.rail === "PIX_SENT") providerDescription = "PIX ENVIADO";
  if (prefix.rail === "PIX_RECEIVED") providerDescription = "PIX RECEBIDO";
  if (prefix.rail === "PIX_TRANSFER") providerDescription = "PIX TRANSFERENCIA";
  if (prefix.rail === "TED") providerDescription = "TED";
  if (prefix.rail === "DOC") providerDescription = "DOC";
  providerDescription = providerDescription.replace(/\b\d+\b/g, " ").replace(/\s+/g, " ").trim();
  return { key, providerDescription, rail: prefix.rail };
}
