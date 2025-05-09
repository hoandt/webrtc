import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("id");
  const token = req.headers.get("authorization");

  if (!userId) {
    return NextResponse.json({ message: "Missing user ID" }, { status: 400 });
  }

  try {
    const apiRes = await fetch(`https://layer-api.swifthub.net/api/identity/v1/User/getUserInfo?id=${userId}`, {
      method: "GET",
      headers: {
        Accept: "text/plain",
        Authorization: token || "",
      },
    });

    const data = await apiRes.json();
    return NextResponse.json(data, { status: apiRes.status });
  } catch (error) {
    console.error("User info proxy error:", error);
    return NextResponse.json({ message: "Failed to fetch user info" }, { status: 500 });
  }
}
