import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization");

  try {
    const apiRes = await fetch("https://layer-api.swifthub.net/api/identity/v1/Authentication/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/plain",
        Authorization: token || "",
      },
      body: JSON.stringify({}),
    });

    const data = await apiRes.text(); // logout usually returns text/plain
    return new NextResponse(data, { status: apiRes.status });
  } catch (error) {
    console.error("Logout proxy error:", error);
    return NextResponse.json({ message: "Logout failed" }, { status: 500 });
  }
}
