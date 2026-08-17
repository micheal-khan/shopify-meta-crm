import { cookies } from "next/headers";
import { getAccessibleStoreIds, requireUser } from "@/lib/auth";
import { SELECTED_STORE_COOKIE } from "@/lib/store-selection";

export async function POST(request: Request) {
  const user = await requireUser();
  const body = await request.json().catch(() => null) as { storeId?: unknown } | null;
  const storeId = typeof body?.storeId === "string" ? body.storeId : "";
  const accessibleStoreIds = await getAccessibleStoreIds(user);
  if (!accessibleStoreIds.includes(storeId)) {
    return Response.json({ error: "Store access denied" }, { status: 403 });
  }

  (await cookies()).set(SELECTED_STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return Response.json({ selectedStoreId: storeId });
}
