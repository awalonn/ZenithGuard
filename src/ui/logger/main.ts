import { mount } from "svelte";
import Logger from "./Logger.svelte";

const target = document.getElementById("app");

if (!target) {
    throw new Error("ZenithGuard: Logger mount target #app was not found.");
}

mount(Logger, { target });
