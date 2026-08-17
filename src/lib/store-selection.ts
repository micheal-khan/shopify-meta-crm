import "server-only";

import { cookies } from "next/headers";

export const SELECTED_STORE_COOKIE = "signaldesk_store_id";

export async function getSelectedStoreId(accessibleStoreIds: string[]) {
  if (!accessibleStoreIds.length) return null;
  const selected = (await cookies()).get(SELECTED_STORE_COOKIE)?.value;
  return selected && accessibleStoreIds.includes(selected) ? selected : accessibleStoreIds[0];
}
