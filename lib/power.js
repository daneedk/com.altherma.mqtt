// power.js
'use strict';

const SQRT3 = 1.7320508075688772;

/**
 * Estimate line-to-line voltage from line-to-neutral voltage.
 * @param {number} vln - Line-to-neutral voltage (V), e.g. 230
 * @returns {number} Estimated line-to-line voltage (V)
 */
function estimateVllFromVln(vln = 230) {
  const Vln = Number(vln);
  if (!Number.isFinite(Vln) || Vln <= 0) return 0;
  return Vln * SQRT3;
}

/**
 * Estimate DC bus voltage for a 3-phase diode rectifier.
 * Vdc ≈ 1.35 * Vll
 * @param {number} vll - Line-to-line voltage (V)
 * @returns {number} Estimated DC bus voltage (V)
 */
function estimateVdcFromVll(vll) {
  const Vll = Number(vll);
  if (!Number.isFinite(Vll) || Vll <= 0) return 0;
  return 1.35 * Vll;
}

function estimatePowerWFromInvPrimaryWithFallback(invPrimaryA, v1, v2, v3, opts = {}) {
  const eta = Number(opts.eta ?? 0.90);
  const is3phaseEnabled = !!opts.is3phaseEnabled;

  // Fallback if voltages missing
  const V1 = Number(v1 ?? 230);
  const V2 = Number(v2 ?? 230);
  const V3 = Number(v3 ?? 230);

  // L‑N voltage selection
  // 3φ → average 3 phases
  // 1φ → use L1 only
  const vlnAvg = is3phaseEnabled ? (V1 + V2 + V3) / 3 : V1;

  // reuse existing math
  return estimatePowerWFromInvPrimary(invPrimaryA, {
    vln: vlnAvg,
    eta,
    is3phaseEnabled,
    minCurrentA: opts.minCurrentA,
  });
}


/**
 * Estimate electrical power (W) from inverter primary current (A).
 *
 * Assumptions:
 * - If opts.is3phaseEnabled === true: 3-phase model (Vdc ≈ 1.35 * (√3 * Vln))
 * - Else: 1-phase model (Vdc ≈ 1.35 * Vln)
 * - Inverter has rectifier -> DC bus; eta is combined efficiency (0..1)
 *
 * @param {number} invPrimaryA - Inverter primary current (A)
 * @param {object} [opts]
 * @param {number} [opts.vln=230] - Line-to-neutral voltage (V)
 * @param {number} [opts.eta=0.90] - Efficiency factor (0..1)
 * @param {number} [opts.minCurrentA=0.1] - Below this, return 0 W
 * @returns {number} Estimated power in Watts (>=0)
 */
function estimatePowerWFromInvPrimary(invPrimaryA, opts = {}) {
  const I = Number(invPrimaryA);
  const vln = Number(opts.vln ?? 230);
  const eta = Number(opts.eta ?? 0.90);
  const minCurrentA = Number(opts.minCurrentA ?? 0.1);
  const is3phaseEnabled = !!opts.is3phaseEnabled;

  if (!Number.isFinite(I) || I < minCurrentA) return 0;
  if (!Number.isFinite(vln) || vln <= 0) return 0;
  if (!Number.isFinite(eta) || eta <= 0 || eta > 1.0) return 0;

  //const vll = estimateVllFromVln(vln);
  //const vdc = estimateVdcFromVll(vll);

  // 3φ: Vdc ≈ 1.35 * (√3 * Vln)
  // 1φ: Vdc ≈ 1.35 * Vln
  const vdc = is3phaseEnabled
    ? estimateVdcFromVll(estimateVllFromVln(vln))
    : 1.35 * vln;


  // DC-side power into inverter
  const pdc = vdc * I;

  // 3φ: DC-link approximation is correct
  // 1φ: DC-link power overestimates real AC power; apply correction (~0.72) 
  const pel = is3phaseEnabled
    ? (pdc / eta)
    : ((pdc * 0.72) / eta);



  return Math.max(0, pel);
}

/**
 * Integrate energy in kWh from power samples using trapezoid integration.
 *
 * E_kWh += ((Pprev + Pnow) / 2) * dtHours / 1000
 *
 * @param {number} prevPowerW
 * @param {number} currPowerW
 * @param {number} dtSeconds - Time delta in seconds
 * @returns {number} Energy increment in kWh (>=0)
 */
function integrateKwh(prevPowerW, currPowerW, dtSeconds) {
  const P0 = Number(prevPowerW);
  const P1 = Number(currPowerW);
  const dt = Number(dtSeconds);

  if (!Number.isFinite(P0) || P0 < 0) return 0;
  if (!Number.isFinite(P1) || P1 < 0) return 0;
  if (!Number.isFinite(dt) || dt <= 0) return 0;

  const dtHours = dt / 3600;
  return ((P0 + P1) / 2) * dtHours / 1000;
}

module.exports = {
  estimateVllFromVln,
  estimateVdcFromVll,
  estimatePowerWFromInvPrimaryWithFallback,
  estimatePowerWFromInvPrimary,
  integrateKwh,
};
