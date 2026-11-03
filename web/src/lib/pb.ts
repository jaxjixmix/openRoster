import PocketBase from "pocketbase";

export const PB_URL =
  process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8097";

export const pb = new PocketBase(PB_URL);
pb.autoCancellation(false);
