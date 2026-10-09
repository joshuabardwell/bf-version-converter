// The app's rule set: Betaflight's CLI colouring, extended with the converter's own categories.
// New categories go here as named rules (and a Role in types.ts, and a theme entry in styles.css),
// never in components.
import { extend } from "../engine.ts";
import { betaflight } from "./betaflight.ts";

export const appRules = extend(betaflight, {});
