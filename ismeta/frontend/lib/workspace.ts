export const DEV_WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";

export function getWorkspaceId(): string {
  return process.env.NEXT_PUBLIC_WORKSPACE_ID ?? DEV_WORKSPACE_ID;
}
