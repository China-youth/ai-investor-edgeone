const logger = {
  info: (...args: any[]) => console.log('[history]', ...args),
  error: (...args: any[]) => console.error('[history]', ...args),
};

export async function onRequestPost(context: any) {
  const body = context.request.body ?? {};
  const conversationId =
    body.conversation_id || body.conversationId || '';

  const store = context.agent?.store;
  if (!store || !conversationId) {
    return Response.json({ conversation_id: conversationId, messages: [] });
  }

  try {
    const history = await store.getMessages({
      conversationId,
      limit: 100,
      order: 'asc',
    });

    // Filter and simplify messages for frontend display
    const messages = history
      .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg: any) => ({
        role: msg.role,
        content: typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content),
        timestamp: msg.timestamp || Date.now(),
      }));

    return Response.json({
      conversation_id: conversationId,
      messages,
    });
  } catch (e) {
    logger.error('Failed to fetch history:', e);
    return Response.json(
      { conversation_id: conversationId, messages: [], error: 'Failed to fetch history' },
      { status: 500 },
    );
  }
}
