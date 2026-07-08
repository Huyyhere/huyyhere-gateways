import { startAutoRefresh } from "./autoRefresh";

const isBuild = typeof process !== "undefined" && (
  process.env?.NEXT_PHASE === "phase-production-build"
  || process.env?.NODE_ENV === "test"
);
if (!isBuild) {
  startAutoRefresh();
}
