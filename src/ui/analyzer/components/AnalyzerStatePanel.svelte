<script lang="ts">
    export let kind: "loading" | "error" | "quota" | "timeout" | "api-key";
    export let title = "";
    export let message = "";
    export let secondaryMessage = "";
    export let primaryActionLabel = "";
    export let secondaryActionLabel = "";
    export let onPrimaryAction: (() => void | Promise<void>) | undefined = undefined;
    export let onSecondaryAction: (() => void | Promise<void>) | undefined = undefined;
</script>

{#if kind === "loading"}
    <div class="loading-view analyzer-state-card analyzer-state-block">
        <div class="loader"></div>
        <p class="state-message">{title}</p>
        <p class="state-submessage">{message}</p>
    </div>
{:else}
    <div class={(kind === "error" ? "error-view" : kind === "api-key" ? "api-key-missing-view" : "quota-error-view") + " state-panel"}>
        <h3>{title}</h3>
        <p>{message}</p>
        {#if secondaryMessage}
            <p>{secondaryMessage}</p>
        {/if}
        {#if primaryActionLabel || secondaryActionLabel}
            <div class:state-actions={Boolean(primaryActionLabel && secondaryActionLabel)}>
                {#if primaryActionLabel}
                    <button class={"btn-apply-all state-action-btn " + (secondaryActionLabel ? "" : "state-action-btn-wide")} on:click={onPrimaryAction}>{primaryActionLabel}</button>
                {/if}
                {#if secondaryActionLabel}
                    <button class="btn-apply-all state-action-btn state-action-btn-wide" on:click={onSecondaryAction}>{secondaryActionLabel}</button>
                {/if}
            </div>
        {/if}
    </div>
{/if}
