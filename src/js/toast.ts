import { installToastUtils, showToast } from "./content/modules/toast";

(globalThis as typeof globalThis & {
    ZenithGuardToastRuntime?: {
        installToastUtils: typeof installToastUtils;
        showToast: typeof showToast;
    };
}).ZenithGuardToastRuntime = {
    installToastUtils,
    showToast,
};
