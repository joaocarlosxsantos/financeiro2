import { test } from "vitest";
import assert from "node:assert/strict";
import {
  isSeriesDataEmpty,
  isProjectionDataEmpty,
  getZeroSafeDomain,
  getZeroSafeTicks,
} from "./chart-utils";

test("isSeriesDataEmpty detecta dados zerados ou vazios", () => {
  assert.equal(isSeriesDataEmpty([]), true);
  assert.equal(isSeriesDataEmpty(null), true);
  assert.equal(isSeriesDataEmpty(undefined), true);

  assert.equal(
    isSeriesDataEmpty([
      { entrou: 0, saiu: 0, sobrou: 0, fixo: 0, variavel: 0 },
      { entrou: 0, saiu: 0, sobrou: 0, fixo: 0, variavel: 0 },
    ]),
    true,
  );

  // Se entrou algum valor
  assert.equal(
    isSeriesDataEmpty([
      { entrou: 100, saiu: 0, sobrou: 100, fixo: 0, variavel: 0 },
    ]),
    false,
  );

  // Se sobrou negativo
  assert.equal(
    isSeriesDataEmpty([
      { entrou: 0, saiu: 50, sobrou: -50, fixo: 50, variavel: 0 },
    ]),
    false,
  );
});

test("isProjectionDataEmpty detecta dados de projecao zerados", () => {
  assert.equal(isProjectionDataEmpty([], ["realista"]), true);
  assert.equal(isProjectionDataEmpty(null, ["realista"]), true);
  assert.equal(isProjectionDataEmpty([{ realista: 100 }], []), true);

  assert.equal(
    isProjectionDataEmpty(
      [
        { label: "Mês 1", conservador: 0, realista: 0, otimista: 0 },
        { label: "Mês 2", conservador: 0, realista: 0, otimista: 0 },
      ],
      ["conservador", "realista", "otimista"],
    ),
    true,
  );

  assert.equal(
    isProjectionDataEmpty(
      [
        { label: "Mês 1", conservador: 0, realista: 500, otimista: 0 },
      ],
      ["conservador", "realista", "otimista"],
    ),
    false,
  );
});

test("getZeroSafeDomain e getZeroSafeTicks retornam parametros discretos quando zerado", () => {
  assert.deepEqual(getZeroSafeDomain(true), [0, 1000]);
  assert.deepEqual(getZeroSafeDomain(false), ["auto", "auto"]);

  assert.deepEqual(getZeroSafeTicks(true), [0, 1000]);
  assert.equal(getZeroSafeTicks(false), undefined);
});
