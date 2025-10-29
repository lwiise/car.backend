import { cors } from "./cors.js";
import * as original from "./resultsSavePublic.js";

export const handler = cors(original.handler);
