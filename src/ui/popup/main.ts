import { mount } from "svelte";
import Popup from "./Popup.svelte";

const target = document.getElementById("app");

if (!target) {
    throw new Error("ZenithGuard: Popup mount target #app was not found.");
}

mount(Popup, { target });
