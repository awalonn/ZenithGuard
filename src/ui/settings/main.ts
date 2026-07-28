import { mount } from "svelte";
import Settings from "./Settings.svelte";

const target = document.getElementById("app");

if (!target) {
    throw new Error("ZenithGuard: Settings mount target #app was not found.");
}

mount(Settings, { target });
