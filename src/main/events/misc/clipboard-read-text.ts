import { clipboard } from "electron";
import { registerEvent } from "../register-event";

const clipboardReadText = () => clipboard.readText();

registerEvent("clipboardReadText", clipboardReadText);
