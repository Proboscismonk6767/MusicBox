import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/server/auth";
import { isSameOrigin } from "@/lib/server/csrf";
import { cancel, statusFor } from "@/lib/server/import-queue";
import { kickImportWorker } from "@/lib/server/history-import";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  const status = statusFor(user.id);
  if (status?.active && status.pending) kickImportWorker(); // e.g. the worker died with a hot reload
  return NextResponse.json({ status }, { headers: noStore });
}

/** Stop looking up the remaining songs. Songs already added stay in the diary. */
export async function DELETE(req: Request) {
  if (!isSameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: noStore });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  cancel(user.id);
  revalidatePath("/", "layout");
  return NextResponse.json({ status: statusFor(user.id) }, { headers: noStore });
}
