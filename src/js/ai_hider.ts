import { AiHider } from "./content/modules/AiHider";

(globalThis as typeof globalThis & { ZenithGuardAiHider?: typeof AiHider }).ZenithGuardAiHider = AiHider;
