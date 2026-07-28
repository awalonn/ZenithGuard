import { showToast } from "../../src/js/content/modules/toast";

describe("content toast", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("renders message text without interpreting markup", () => {
        showToast({
            message: '<img src=x onerror="window.__toastInjected=true">blocked',
            type: "error",
            duration: 0,
        });

        const toast = document.querySelector(".zg-toast");
        expect(toast?.textContent).toContain('<img src=x onerror="window.__toastInjected=true">blocked');
        expect(toast?.querySelector("img")).toBeNull();
    });
});
