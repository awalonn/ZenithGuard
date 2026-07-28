import { Zapper } from "./content/modules/Zapper";

(globalThis as typeof globalThis & { ZenithGuardZapper?: typeof Zapper }).ZenithGuardZapper = Zapper;
