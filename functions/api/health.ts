export async function onRequestGet() {
  return Response.json({
    success: true,
    project: "InGiDay",
  });
}
