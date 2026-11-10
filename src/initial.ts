import { blank, type State } from './model.ts';
// Cada instalación empieza vacía, sin datos del autor ni de otra persona.
export function initialState(): State { return blank(); }
