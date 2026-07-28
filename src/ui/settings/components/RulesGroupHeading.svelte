<script lang="ts">
    export let title = "";
    export let description = "";
    export let tag = "";
    export let tagTone: "default" | "recommended" | "neutral" = "default";
</script>

<div class:top-gap={tagTone === "neutral"} class="rules-group-heading">
    <div>
        <h2>{title}</h2>
        <p class="setting-description">{description}</p>
    </div>
    <span class={"section-tag " + (tagTone === "recommended" ? "recommended" : tagTone === "neutral" ? "neutral" : "")}>{tag}</span>
</div>
