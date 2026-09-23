export async function onRequest(context: any) {
  // Read conversation_id from body only; NEVER read makers-conversation-id header
  const conversationId = context.request?.body?.conversation_id as string | undefined;
  if (!conversationId) {
    return new Response('Missing conversation_id', { status: 400 });
  }

  const ret = context.utils.abortActiveRun(conversationId);
  return new Response(
    JSON.stringify({
      status: ret?.aborted ? 'aborting' : 'idle',
      conversation_id: conversationId,
      ...ret,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    },
  );
}
