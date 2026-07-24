import type { NextRequest } from "next/server.js";
import { handleConfirmGet, handleConfirmPost } from "./confirmHandlers.ts";

export function GET(request: NextRequest) {
  return handleConfirmGet(request);
}

export function POST(request: NextRequest) {
  return handleConfirmPost(request);
}
