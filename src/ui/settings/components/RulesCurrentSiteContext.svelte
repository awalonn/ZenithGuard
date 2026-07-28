<script lang="ts">
    export let domain: string;
    export let onPause: () => void | Promise<void>;
    export let onIsolation: () => void | Promise<void>;
    export let onForgetful: () => void | Promise<void>;
</script>

<div class="info-box contextual-info-box">
    <p><strong>Current site context:</strong> {domain}</p>
    <div class="context-action-row">
        <button type="button" class="btn btn-secondary btn-small" on:click={onPause}>Pause This Site</button>
        <button type="button" class="btn btn-secondary btn-small" on:click={onIsolation}>Enable Isolation</button>
        <button type="button" class="btn btn-secondary btn-small" on:click={onForgetful}>Enable Forgetful Browsing</button>
    </div>
</div>
