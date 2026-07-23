import path from "node:path";

export const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const ARTIFACTS_DIR = path.join(REPO_ROOT, "e2e-artifacts");
export const AUTH_DIR = path.join(ARTIFACTS_DIR, ".auth");
export const MEMBER_STATE = path.join(AUTH_DIR, "member.json");
export const ADMIN_STATE = path.join(AUTH_DIR, "admin.json");
export const PROOF_DIR = path.join(ARTIFACTS_DIR, "proof");
export const LOG_DIR = path.join(ARTIFACTS_DIR, "logs");
