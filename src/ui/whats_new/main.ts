import { mount } from "svelte";
import WhatsNew from "./WhatsNew.svelte";

const target = document.getElementById("app");

if (!target) {
    throw new Error("ZenithGuard: What's New mount target #app was not found.");
}

mount(WhatsNew, { target });
