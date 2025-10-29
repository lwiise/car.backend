import { cors } from "./cors.js";
import * as original from "./resultsList.js";

export const handler = cors(original.handler);
