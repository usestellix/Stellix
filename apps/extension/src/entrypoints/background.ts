import { defineBackground } from "wxt/utils/define-background";
import { startBackground } from "../background/start.js";

export default defineBackground({
  type: "module",
  main() {
    startBackground();
  },
});
