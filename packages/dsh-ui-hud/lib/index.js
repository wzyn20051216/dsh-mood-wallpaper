/**
 * dsh-ui-hud — host half.
 *
 * Intentionally a no-op loader entry: the whole feature lives in the browser
 * half (`./client`), picked up by dsh-client-modules through the package's
 * `dsh.client` declaration. Persistence is localStorage (UI preference), so
 * no host settings transport is needed.
 */

/** Host loader entry for the browser implementation exported from `./client`. */
export function apply() {}
