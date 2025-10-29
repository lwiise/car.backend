import { cors } from "./cors.js";
import * as original from "./carMatch.js";

export const handler = cors(original.handler);
