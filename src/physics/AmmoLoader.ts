import * as pc from 'playcanvas';

/**
 * Boots Ammo and publishes it as a global.
 *
 * PlayCanvas's rigidbody system reads a *bare* `Ammo` identifier
 * (`typeof Ammo !== 'undefined'` in framework/components/rigid-body/system.js),
 * so the module must exist on globalThis before the app is created. That
 * coupling is engine-mandated; confining it to this file keeps it from leaking.
 *
 * Why a vendored build rather than an npm package: neither `ammojs-typed` nor
 * `ammo.js` on npm ships a build this engine can drive. Both predate
 * `Ammo.addFunction`, the Emscripten runtime export PlayCanvas needs to install
 * Bullet's internal tick callback — and without that callback the engine warns
 * outright that contacts may go unreported. This game detects every finish
 * through a trigger volume, so unreliable contacts would mean unreliable
 * results. `public/lib/ammo/` therefore holds the build PlayCanvas develops and
 * tests against, taken from playcanvas/engine (zlib licensed, same as ammo.js
 * upstream).
 *
 * WasmModule picks the WASM build where available and falls back to asm.js
 * otherwise, which also keeps the physics engine off the critical path until
 * it's actually needed (PRD §19).
 */

const AMMO_BASE = 'lib/ammo';

let loading: Promise<void> | null = null;

export function loadAmmo(): Promise<void> {
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    pc.WasmModule.setConfig('Ammo', {
      glueUrl: `${AMMO_BASE}/ammo.wasm.js`,
      wasmUrl: `${AMMO_BASE}/ammo.wasm.wasm`,
      fallbackUrl: `${AMMO_BASE}/ammo.js`,
    });

    // getInstance resolves with the module and also assigns the global itself,
    // but we set it explicitly so the contract of this function is visible.
    pc.WasmModule.getInstance('Ammo', (instance: unknown) => {
      if (!instance) {
        reject(new Error('Ammo failed to initialise'));
        return;
      }
      (globalThis as Record<string, unknown>).Ammo = instance;
      resolve();
    });
  });

  return loading;
}

export function isAmmoReady(): boolean {
  return typeof (globalThis as Record<string, unknown>).Ammo !== 'undefined';
}
