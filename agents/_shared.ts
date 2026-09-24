/**
 * Shared utilities for SSE streaming and logging
 */

export interface SSEEvent {
  type: string;
  content?: string;
  name?: string;
  [key: string]: any;
}

export function sseEvent(data: SSEEvent): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export function createSSEResponse(
  generator: AsyncGenerator<string, void, unknown>,
  signal?: AbortSignal,
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      console.log('[sse] Stream start() invoked, beginning generator consumption...');
      // Heartbeat every 5s
      const heartbeat = setInterval(() => {
        if (signal?.aborted) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(sseEvent({ type: 'ping' }));
        } catch {
          clearInterval(heartbeat);
        }
      }, 5000);

      try {
        for await (const chunk of generator) {
          if (signal?.aborted) break;
          controller.enqueue(chunk);
        }
      } catch (e) {
        const err = e as Error;
        console.error('[sse] Generator threw outside inner try/catch:', err.message, err.stack);
        if (!signal?.aborted) {
          controller.enqueue(sseEvent({ type: 'error_message', content: err.message }));
        }
      } finally {
        clearInterval(heartbeat);
        if (!signal?.aborted) {
          controller.enqueue(`data: [DONE]\n\n`);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

export function createLogger(tag: string) {
  return {
    info: (...args: any[]) => console.log(`[${tag}]`, ...args),
    error: (...args: any[]) => console.error(`[${tag}]`, ...args),
    warn: (...args: any[]) => console.warn(`[${tag}]`, ...args),
  };
}
