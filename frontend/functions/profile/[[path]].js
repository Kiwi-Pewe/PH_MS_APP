import { servePath } from "../_shared.js";

export function onRequest(context) {
  return servePath(context, "/main/app");
}
