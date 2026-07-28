import { mount } from "svelte";
import Analyzer from "./Analyzer.svelte";

const target = document.getElementById("app");

if (!target) {
    throw new Error("ZenithGuard: Analyzer mount target #app was not found.");
}

mount(Analyzer, { target });
