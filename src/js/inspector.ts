import { Inspector } from "./content/modules/Inspector";

(globalThis as typeof globalThis & { ZenithGuardInspector?: typeof Inspector }).ZenithGuardInspector = Inspector;
